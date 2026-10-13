/**
 * 通用 Excel 导出工具
 *
 * 重要:使用 exceljs 生成真正的 OOXML .xlsx 格式(zip 压缩)。
 * 之前的 SpreadsheetML 2003 XML 在 Mac/WPS/新版 Excel 中可能识别不到
 * (MIME 是 application/vnd.ms-excel 但实际内容是 XML,被识别为乱码)。
 */
import ExcelJS from 'exceljs'
import type { Response } from 'express'

export interface ExcelColumn {
  header: string
  key: string
  width?: number
  numFmt?: string  // e.g. '#,##0.00' 金额
  align?: 'left' | 'center' | 'right'
  /** 取值格式化:从 row 对象取最终单元格值 */
  format?: (row: any) => any
}

export interface ExcelSheet {
  name: string
  columns: ExcelColumn[]
  rows: any[]
  /** 额外子表头(例如公司信息) */
  title?: string
  subtitle?: string
}

export interface BuildXlsxOptions {
  filename: string
  sheets: ExcelSheet[]
  companyName?: string
  /** 是否每行加边框(默认 true) */
  bordered?: boolean
}

/** 格式化单元格:支持日期/数字/字符串/布尔,NaN/undefined→空字符串 */
function formatCellValue(v: unknown): { value: any; numFmt?: string; isDate: boolean } {
  if (v == null) return { value: '', isDate: false }
  if (typeof v === 'number') {
    if (Number.isNaN(v) || !Number.isFinite(v)) return { value: '', isDate: false }
    return { value: v, isDate: false }
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: '', isDate: false }
    return { value: v, numFmt: 'yyyy-mm-dd', isDate: true }
  }
  if (typeof v === 'boolean') return { value: v, isDate: false }
  // 字符串:处理 'NaN' / 'undefined' / 'null'
  if (typeof v === 'string') {
    if (v === 'NaN' || v === 'undefined' || v === 'null') return { value: '', isDate: false }
  }
  return { value: String(v), isDate: false }
}

/** 构建 Excel Buffer (zip 压缩的 OOXML) */
export async function buildXlsx(opts: BuildXlsxOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = opts.companyName || 'FM 财务系统'
  wb.created = new Date()
  wb.modified = new Date()

  for (const s of opts.sheets) {
    const ws = wb.addWorksheet(s.name, {
      views: [{ state: 'frozen', ySplit: (s.title ? 2 : 0) + (s.subtitle ? 1 : 0) + 1 }],
    })
    let curRow = 1

    // 公司抬头(可选)
    if (s.title) {
      ws.mergeCells(curRow, 1, curRow, s.columns.length)
      const tCell = ws.getCell(curRow, 1)
      tCell.value = s.title
      tCell.font = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      tCell.alignment = { horizontal: 'center', vertical: 'middle' }
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      ws.getRow(curRow).height = 28
      curRow++
    }

    // 副标题
    if (s.subtitle) {
      ws.mergeCells(curRow, 1, curRow, s.columns.length)
      const subCell = ws.getCell(curRow, 1)
      subCell.value = s.subtitle
      subCell.font = { name: 'Microsoft YaHei', size: 10, italic: true, color: { argb: 'FF64748B' } }
      subCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(curRow).height = 18
      curRow++
    }

    // 表头
    const headerRow = ws.getRow(curRow)
    s.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: col.align || 'center', vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
    })
    headerRow.height = 26
    curRow++

    // 列宽
    s.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width || 14
    })

    // 数据行
    for (const row of s.rows) {
      const er = ws.getRow(curRow)
      s.columns.forEach((col, i) => {
        const cell = er.getCell(i + 1)
        let raw: any
        if (col.format) {
          raw = col.format(row)
        } else {
          raw = row[col.key]
        }
        const { value, numFmt } = formatCellValue(raw)
        cell.value = value as any
        cell.font = { name: 'Microsoft YaHei', size: 10 }
        cell.alignment = { horizontal: col.align || 'left', vertical: 'middle', wrapText: true }
        if (col.numFmt) cell.numFmt = col.numFmt
        else if (numFmt) cell.numFmt = numFmt
        if (opts.bordered !== false) {
          cell.border = {
            top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          }
        }
        // 数字右对齐
        if (typeof value === 'number' && !col.align) cell.alignment = { horizontal: 'right', vertical: 'middle' }
      })
      curRow++
    }

    // 末尾合计行:如果 columns 中某 col.key 以 'total' 开头且 col.format 返回数字,可选加 SUM
    // (这里不强制,各业务按需在 rows 自行加)
  }

  // 写入 Buffer
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

/** 直接通过 Response 发送 xlsx */
export function sendXlsx(res: Response, buf: Buffer, filename: string): void {
  // RFC 5987 中文文件名编码
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')
  // ⚠️ MIME 必须是 .xlsx 对应的 OOXML,不能用 vnd.ms-excel (那是老 .xls)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`)
  res.setHeader('Content-Length', String(buf.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
  res.end(buf)
  // 抛 marker 防止 EnvelopeInterceptor 再次包装
  throw new ResponseSentError()
}

/** Marker 错误: 标识此响应已被 controller 直接 res.end */
export class ResponseSentError extends Error {
  constructor() {
    super('__RESPONSE_SENT__')
    this.name = 'ResponseSentError'
  }
}
