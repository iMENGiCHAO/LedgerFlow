/**
 * 种子数据:演示账套 + 角色用户 + 科目 + 完整业务演示数据
 * 用法:pnpm run db:seed   (幂等:重复执行会跳过已存在的演示账套)
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// 手动加载 server/.env(独立运行时 prisma CLI 的 dotenv 注入不可用)
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PRESET_SUBJECTS, ROLE_PRESETS, ALL_PERMS } from '../src/constants/master-data';
import { REPORT_PRESETS } from '../src/constants/report-formulas';

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  console.log('== 0. 全局报表公式 ==');
  for (const preset of REPORT_PRESETS) {
    for (const row of preset.rows) {
      await prisma.reportFormula.upsert({
        where: { reportCode_rowKey: { reportCode: preset.reportCode, rowKey: row.rowKey } },
        update: { rowName: row.rowName, indent: row.indent ?? 0, bold: row.bold ?? false, expr: row.expr as object, sort: row.sort },
        create: { reportCode: preset.reportCode, rowKey: row.rowKey, rowName: row.rowName, indent: row.indent ?? 0, bold: row.bold ?? false, expr: row.expr as object, sort: row.sort },
      });
    }
  }
  console.log('  报表公式 BS/IS 已就绪');

  console.log('== 1. 角色与用户 ==');
  const roleMap = new Map<string, number>();
  for (const rp of ROLE_PRESETS) {
    const perms = rp.perms === 'ALL' ? ALL_PERMS : rp.perms;
    const role = await prisma.role.upsert({
      where: { code: rp.code },
      update: { name: rp.name, permissions: perms, remark: rp.remark },
      create: { code: rp.code, name: rp.name, permissions: perms, remark: rp.remark },
    });
    roleMap.set(rp.code, role.id);
  }

  const users: { username: string; password: string; realName: string; roleCode: string; isSuper?: boolean; deptCode?: string }[] = [
    { username: 'admin', password: 'Admin@123', realName: '系统管理员', roleCode: 'ADMIN', isSuper: true },
    { username: 'cfo', password: 'Cfo@123', realName: '陈主管', roleCode: 'CFO', deptCode: 'd02' },
    { username: 'zhangsan', password: 'Acc@123', realName: '张三', roleCode: 'ACCOUNTANT', deptCode: 'd02' },
    { username: 'lisi', password: 'Cash@123', realName: '李四', roleCode: 'CASHIER', deptCode: 'd02' },
    { username: 'wangwu', password: 'Emp@123', realName: '王五', roleCode: 'EMPLOYEE', deptCode: 'd01' },
    { username: 'boss', password: 'Boss@123', realName: '赵总', roleCode: 'BOSS', deptCode: 'd01' },
  ];
  const userIds = new Map<string, number>();
  for (const u of users) {
    const roleId = roleMap.get(u.roleCode)!;
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { realName: u.realName, isSuper: u.isSuper ?? false, status: 1 },
      create: {
        username: u.username,
        passwordHash: bcrypt.hashSync(u.password, 10),
        realName: u.realName,
        isSuper: u.isSuper ?? false,
        status: 1,
      },
    });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId } }, update: {}, create: { userId: user.id, roleId } });
    userIds.set(u.username, user.id);
  }
  console.log(`  6 个用户就绪: ${[...userIds.keys()].join(', ')}`);

  // 业务规则:公司信息从环境变量读取,无环境变量时回退默认值(便于首次部署)
  // 部署方可通过 export SEED_TENANT_NAME=... 等环境变量替换演示数据
  const SEED_TENANT_NAME = process.env.SEED_TENANT_NAME || '演示科技有限公司';
  const SEED_TENANT_TAX_NO = process.env.SEED_TENANT_TAX_NO || '91310000MA1K38B2XL';
  const SEED_TENANT_ADDRESS = process.env.SEED_TENANT_ADDRESS || '上海市浦东新区演示路 88 号';
  const SEED_TENANT_LEGAL_REP = process.env.SEED_TENANT_LEGAL_REP || '赵总';
  const SEED_TENANT_START_YEAR = Number(process.env.SEED_TENANT_START_YEAR) || 2026;
  const SEED_TENANT_START_MONTH = Number(process.env.SEED_TENANT_START_MONTH) || 1;

  console.log('== 2. 演示账套 ==');
  let tenant = await prisma.tenant.findFirst({ where: { name: SEED_TENANT_NAME } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: SEED_TENANT_NAME,
        taxNo: SEED_TENANT_TAX_NO,
        address: SEED_TENANT_ADDRESS,
        legalRep: SEED_TENANT_LEGAL_REP,
        startYear: SEED_TENANT_START_YEAR,
        startMonth: SEED_TENANT_START_MONTH,
        status: 1,
        params: { gmExpenseThreshold: 5000 },
      },
    });
  }
  const tenantId = tenant.id;
  // 用户-账套关联
  for (const uid of userIds.values()) {
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: uid, tenantId } },
      update: { isDefault: true },
      create: { userId: uid, tenantId, isDefault: true },
    });
  }

  if (await prisma.voucher.count({ where: { tenantId } }) > 0) {
    console.log('!! 账套已有凭证,跳过业务数据灌注(如需重置:pnpm run db:reset)');
    return;
  }

  console.log('== 3. 会计期间 2026-01 ~ 2027-12 ==');
  const periods = [];
  for (const y of [2026, 2027]) for (let m = 1; m <= 12; m++) periods.push({ tenantId, year: y, month: m, status: 1 });
  await prisma.period.createMany({ data: periods, skipDuplicates: true });
  const periodMap = new Map<string, number>();
  for (const p of await prisma.period.findMany({ where: { tenantId } })) periodMap.set(`${p.year}-${p.month}`, p.id);

  console.log('== 4. 科目(预置 + 费用明细)==');
  await prisma.subject.createMany({
    data: PRESET_SUBJECTS.map((s) => ({
      tenantId, code: s.code, name: s.name, category: s.category, direction: s.direction,
      isLeaf: true, assist: s.assist as object | undefined, cashFlowType: s.cashFlowType ?? undefined, status: 1,
    })),
    skipDuplicates: true,
  });
  const codeToId = new Map<string, number>();
  const refreshSubjects = async () => {
    const rows = await prisma.subject.findMany({ where: { tenantId } });
    for (const r of rows) codeToId.set(r.code, r.id);
  };
  await refreshSubjects();
  const addChild = async (parentCode: string, code: string, name: string, extra?: Partial<Parameters<typeof prisma.subject.create>[0]['data']>) => {
    const parentId = codeToId.get(parentCode)!;
    await prisma.subject.update({ where: { id: parentId }, data: { isLeaf: false } });
    const parent = await prisma.subject.findUniqueOrThrow({ where: { id: parentId } });
    const rec = await prisma.subject.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name },
      create: {
        tenantId, code, name, parentId, category: parent.category, direction: parent.direction,
        isLeaf: true, assist: extra?.assist ?? parent.assist ?? undefined, cashFlowType: extra?.cashFlowType ?? parent.cashFlowType ?? undefined, status: 1,
      },
    });
    codeToId.set(code, rec.id);
  };
  await addChild('1002', '100201', '工商银行基本户', { cashFlowType: 'BANK' });
  await addChild('5602', '560201', '办公费');
  await addChild('5602', '560202', '差旅费');
  await addChild('5602', '560203', '业务招待费');
  await addChild('5602', '560204', '工资');
  await addChild('5602', '560205', '折旧费');
  await addChild('2221', '222101', '应交增值税');
  await addChild('5601', '560101', '差旅费(销售)');
  const sid = (code: string) => codeToId.get(code)!;

  console.log('== 5. 部门/项目/员工/往来单位 ==');
  const depts = [
    { code: 'd01', name: '综合部' }, { code: 'd02', name: '财务部' },
    { code: 'd03', name: '销售部' }, { code: 'd04', name: '生产部' },
  ];
  for (const dd of depts) await prisma.department.upsert({ where: { tenantId_code: { tenantId, code: dd.code } }, update: dd, create: { tenantId, ...dd } });
  const deptId = new Map((await prisma.department.findMany({ where: { tenantId } })).map((x) => [x.code, x.id] as const));

  // 给 6 个用户绑定部门(让审批路由能拿得到)
  const userDeptMap: Record<string, string | null> = {
    admin: null,        // 系统管理员不属部门
    cfo: 'd02',         // 财务部
    zhangsan: 'd02',    // 财务部(会计)
    lisi: 'd02',        // 财务部(出纳)
    wangwu: 'd01',      // 行政部(员工)
    boss: 'd01',        // 行政部(总经理,小公司"总经办"并到行政)
  }
  for (const [uname, dcode] of Object.entries(userDeptMap)) {
    const uid = userIds.get(uname)
    if (uid) await prisma.user.update({ where: { id: uid }, data: { deptId: dcode ? deptId.get(dcode) ?? null : null } })
  }
  await prisma.project.upsert({ where: { tenantId_code: { tenantId, code: 'p01' } }, update: { name: '智慧园区项目' }, create: { tenantId, code: 'p01', name: '智慧园区项目' } });
  await prisma.employee.upsert({ where: { tenantId_code: { tenantId, code: 'E001' } }, update: {}, create: { tenantId, code: 'E001', name: '王五', deptId: deptId.get('d01'), position: '行政专员' } });
  await prisma.employee.upsert({ where: { tenantId_code: { tenantId, code: 'E002' } }, update: {}, create: { tenantId, code: 'E002', name: '张三', deptId: deptId.get('d02'), position: '会计' } });

  const partnerDefs = [
    { code: 'C001', name: '华辰科技股份有限公司', type: 1, taxNo: '913100007887123456', contact: '刘经理', phone: '13800001234', creditDays: 60 },
    { code: 'C002', name: '蓝海贸易(集团)有限公司', type: 1, taxNo: '913100007876543210', contact: '孙总', phone: '13900005678', creditDays: 45 },
    { code: 'S001', name: '恒信机械设备有限公司', type: 2, taxNo: '913100007654321098', contact: '周经理', phone: '13700009876', creditDays: 90 },
    { code: 'S002', name: '锦绣办公用品经营部', type: 2, taxNo: '923100007098765432', contact: '吴经理', phone: '13600004321', creditDays: 30 },
  ];
  for (const pdef of partnerDefs) await prisma.partner.upsert({ where: { tenantId_code: { tenantId, code: pdef.code } }, update: pdef, create: { tenantId, ...pdef } });
  const ptn = Object.fromEntries((await prisma.partner.findMany({ where: { tenantId } })).map((p) => [p.code, p.id] as const));

  console.log('== 6. 期初余额 ==');
  await prisma.initialBalance.deleteMany({ where: { tenantId } });
  await prisma.initialBalance.createMany({
    data: [
      // 借贷必须平衡:资产+ = 负债+权益
      { tenantId, subjectId: sid('1001'),   direction: 'D', amount: new Prisma.Decimal(20000) },   // 库存现金
      { tenantId, subjectId: sid('100201'), direction: 'D', amount: new Prisma.Decimal(480000) },  // 工行存款
      { tenantId, subjectId: sid('3001'),   direction: 'C', amount: new Prisma.Decimal(500000) },  // 实收资本 (D=500000 == C=500000)
    ],
  });

  console.log('== 7. 资金账户 ==');
  await prisma.bankAccount.upsert({
    where: { id: 1 },
    update: { name: '工商银行基本户', bankName: '工商银行浦东分行', accountNo: '100118200999001', subjectId: sid('100201') },
    create: { tenantId, name: '工商银行基本户', bankName: '工商银行浦东分行', accountNo: '100118200999001', subjectId: sid('100201'), status: 1 },
  });

  console.log('== 8. 演示凭证 ==');
  const acc = userIds.get('zhangsan')!;
  const cfo = userIds.get('cfo')!;
  type EntrySpec = { summary: string; code: string; debit?: number; credit?: number; partner?: string; dept?: string; settleType?: string; settleNo?: string };
  let voucherNo = new Map<number, number>();
  const nextNo = (periodId: number) => {
    const n = (voucherNo.get(periodId) ?? 0) + 1;
    voucherNo.set(periodId, n);
    return n;
  };
  const makeVoucher = async (spec: {
    date: string; period: string; memo: string; status: 0 | 1 | 2; sourceType?: number; entries: EntrySpec[]; word?: string;
  }) => {
    const entries = spec.entries.map((e, i) => ({
      lineNo: i + 1,
      summary: e.summary,
      subjectId: sid(e.code),
      debit: new Prisma.Decimal(e.debit ?? 0),
      credit: new Prisma.Decimal(e.credit ?? 0),
      partnerId: e.partner ? ptn[e.partner] : null,
      departmentId: e.dept ? deptId.get(e.dept)! : null,
      settleType: e.settleType ?? null,
      settleNo: e.settleNo ?? null,
    }));
    const totalDebit = spec.entries.reduce((a, e) => a + (e.debit ?? 0), 0);
    const voucher = await prisma.voucher.create({
      data: {
        tenantId,
        periodId: periodMap.get(spec.period)!,
        word: spec.word ?? '记',
        no: nextNo(periodMap.get(spec.period)!),
        date: d(spec.date),
        status: spec.status,
        totalDebit: new Prisma.Decimal(totalDebit),
        totalCredit: new Prisma.Decimal(spec.entries.reduce((a, e) => a + (e.credit ?? 0), 0)),
        memo: spec.memo,
        sourceType: spec.sourceType ?? 0,
        createdBy: acc,
        auditedBy: spec.status === 2 ? cfo : null,
        auditedAt: spec.status === 2 ? d(spec.date) : null,
        entries: { create: entries },
      },
    });
    return voucher;
  };

  // ===== 2026-01(已结账)=====
  await makeVoucher({ date: '2026-01-03', period: '2026-1', memo: '收到华辰预付款', status: 2, word: '收', entries: [
    { summary: '收到华辰销售预付款', code: '100201', debit: 50000, settleType: '转账' },
    { summary: '确认合同预收款', code: '2203', credit: 50000, partner: 'C001' },
  ] });
  await makeVoucher({ date: '2026-01-05', period: '2026-1', memo: '购置笔记本电脑5台', status: 2, entries: [
    { summary: '购置笔记本电脑5台', code: '1601', debit: 35000 },
    { summary: '支付设备款', code: '100201', credit: 35000, settleType: '转账' },
  ] });
  await makeVoucher({ date: '2026-01-10', period: '2026-1', memo: '购置商务车一辆', status: 2, entries: [
    { summary: '购置商务车一辆', code: '1601', debit: 180000 },
    { summary: '支付车辆款项', code: '100201', credit: 180000, settleType: '转账' },
  ] });
  await makeVoucher({ date: '2026-01-10', period: '2026-1', memo: '购置办公家具', status: 2, entries: [
    { summary: '购置办公桌20套', code: '1601', debit: 20000 },
    { summary: '支付家具款', code: '100201', credit: 20000, settleType: '转账' },
  ] });
  await makeVoucher({ date: '2026-01-12', period: '2026-1', memo: '向华辰销售设备并开票', status: 2, entries: [
    { summary: '销售设备一批(开票SA-20260112)', code: '1122', debit: 226000, partner: 'C001' },
    { summary: '主营业务收入', code: '5001', credit: 200000 },
    { summary: '销项税额', code: '222101', credit: 26000 },
  ] });
  await makeVoucher({ date: '2026-01-15', period: '2026-1', memo: '向恒信采购原材料', status: 2, entries: [
    { summary: '采购原材料入库', code: '1405', debit: 150000 },
    { summary: '进项税额', code: '222101', debit: 19500 },
    { summary: '应付恒信设备款', code: '2202', credit: 169500, partner: 'S001' },
  ] });
  await makeVoucher({ date: '2026-01-18', period: '2026-1', memo: '支付1月房租', status: 2, word: '付', entries: [
    { summary: '支付办公室房租', code: '560201', debit: 12000, dept: 'd02' },
    { summary: '银行账户支付', code: '100201', credit: 12000, settleType: '转账' },
  ] });
  await makeVoucher({ date: '2026-01-20', period: '2026-1', memo: '结转销售成本', status: 2, entries: [
    { summary: '结转华辰销售设备成本', code: '5401', debit: 120000 },
    { summary: '库存商品减少', code: '1405', credit: 120000 },
  ] });
  await makeVoucher({ date: '2026-01-25', period: '2026-1', memo: '发放1月工资', status: 2, word: '付', entries: [
    { summary: '计提并发放管理岗工资', code: '560204', debit: 80000, dept: 'd02' },
    { summary: '银行代发', code: '100201', credit: 80000, settleType: '转账' },
  ] });
  // 结转损益
  await makeVoucher({ date: '2026-01-31', period: '2026-1', memo: '2026-01 结转损益', status: 2, word: '转', sourceType: 4, entries: [
    { summary: '结转主营业务收入', code: '5001', debit: 200000 },
    { summary: '结转主营业务成本', code: '5401', credit: 120000 },
    { summary: '结转管理费用', code: '560201', credit: 12000 },
    { summary: '结转管理费用(工资)', code: '560204', credit: 80000 },
    { summary: '结转本年利润', code: '3103', debit: 12000 },
  ] });
  // 关闭 2026-01
  await prisma.period.update({ where: { tenantId_year_month: { tenantId, year: 2026, month: 1 } }, data: { status: 2, closedBy: cfo, closedAt: d('2026-02-01') } });

  // ===== 2026-02(进行中)=====
  await makeVoucher({ date: '2026-02-05', period: '2026-2', memo: '向蓝海贸易销售并开票', status: 2, entries: [
    { summary: '销售软件授权(开票SA-20260205)', code: '1122', debit: 169500, partner: 'C002' },
    { summary: '主营业务收入', code: '5001', credit: 150000 },
    { summary: '销项税额', code: '222101', credit: 19500 },
  ] });
  await makeVoucher({ date: '2026-02-08', period: '2026-2', memo: '收到华辰货款', status: 2, word: '收', entries: [
    { summary: '收到华辰科技货款', code: '100201', debit: 50000, settleType: '转账', settleNo: 'BANK-20260208' },
    { summary: '冲减华辰应收账款', code: '1122', credit: 50000, partner: 'C001' },
  ] });
  await makeVoucher({ date: '2026-02-20', period: '2026-2', memo: '支付办公用品费', status: 2, word: '付', entries: [
    { summary: '购置办公用品', code: '560201', debit: 3600, dept: 'd02' },
    { summary: '银行账户支付', code: '100201', credit: 3600, settleType: '转账' },
  ] });
  await makeVoucher({ date: '2026-02-24', period: '2026-2', memo: '恒信二期设备采购(待审核)', status: 1, entries: [
    { summary: '购入生产设备', code: '1405', debit: 80000 },
    { summary: '进项税额', code: '222101', debit: 10400 },
    { summary: '应付恒信二期款', code: '2202', credit: 90400, partner: 'S001' },
  ] });
  await makeVoucher({ date: '2026-02-26', period: '2026-2', memo: '王五差旅报销(草稿)', status: 0, entries: [
    { summary: '差旅报销-交通住宿餐补', code: '560202', debit: 2860, dept: 'd01' },
    { summary: '待支付', code: '100201', credit: 2860 },
  ] });

  console.log('== 9. 固定资产 ==');
  const FA_LIFE: Record<string, number> = { 电子设备: 36, 运输工具: 48, 办公家具: 60 };
  for (const [i, fa] of [
    { name: '笔记本电脑5台', category: '电子设备', acquiredDate: d('2026-01-05'), originalValue: 35000 },
    { name: '商务用车一辆', category: '运输工具', acquiredDate: d('2026-01-10'), originalValue: 180000 },
    { name: '办公桌椅20套', category: '办公家具', acquiredDate: d('2026-01-10'), originalValue: 20000 },
  ].entries()) {
    await prisma.fixedAsset.create({
      data: {
        tenantId,
        cardNo: `FA-${String(i + 1).padStart(5, '0')}`,
        name: fa.name,
        category: fa.category,
        acquiredDate: fa.acquiredDate,
        originalValue: new Prisma.Decimal(fa.originalValue),
        salvageRate: new Prisma.Decimal(0.05),
        lifeMonths: FA_LIFE[fa.category],
        useDeptId: deptId.get('d02'),
        depExpenseSubjectId: sid('560205'),
        createdBy: acc,
        acquireVoucherId: null,
      },
    });
  }

  console.log('== 10. 应收应付单据 ==');
  const ar001 = await prisma.arapBill.create({
    data: { tenantId, type: 1, billNo: 'AR-202602-0001', partnerId: ptn['C001'], date: d('2026-01-12'), dueDate: d('2026-03-12'), amount: new Prisma.Decimal(226000), memo: '1月销售开票应收', createdBy: userIds.get('cfo')! },
  });
  await prisma.arapBill.create({
    data: { tenantId, type: 2, billNo: 'RC-202602-0001', partnerId: ptn['C001'], date: d('2026-02-08'), amount: new Prisma.Decimal(50000), memo: '收到华辰货款', createdBy: userIds.get('cfo')!, voucherId: null },
  });
  const rcVoucher = await prisma.voucher.findFirst({ where: { tenantId, memo: { contains: '收到华辰货款' } } });
  if (rcVoucher) {
    await prisma.arapBill.updateMany({ where: { tenantId, billNo: 'RC-202602-0001' }, data: { voucherId: rcVoucher.id } });
  }
  await prisma.arapBill.create({
    data: { tenantId, type: 1, billNo: 'AR-202602-0002', partnerId: ptn['C002'], date: d('2026-02-05'), dueDate: d('2026-03-20'), amount: new Prisma.Decimal(169500), memo: '蓝海软件授权应收', createdBy: userIds.get('cfo')! },
  });
  await prisma.arapBill.create({
    data: { tenantId, type: 3, billNo: 'AP-202601-0001', partnerId: ptn['S001'], date: d('2026-01-15'), dueDate: d('2026-04-15'), amount: new Prisma.Decimal(169500), memo: '恒信原材料采购应付', createdBy: userIds.get('cfo')! },
  });
  await prisma.arapBill.create({
    data: { tenantId, type: 3, billNo: 'AP-202602-0002', partnerId: ptn['S001'], date: d('2026-02-24'), dueDate: d('2026-05-24'), amount: new Prisma.Decimal(90400), memo: '恒信二期设备应付(对应待审核凭证)', createdBy: userIds.get('cfo')! },
  });
  // 核销:RC-0001 冲抵 AR-0001
  const rc = await prisma.arapBill.findFirstOrThrow({ where: { tenantId, billNo: 'RC-202602-0001' } });
  await prisma.arapWriteoff.create({ data: { tenantId, openBillId: ar001.id, settleBillId: rc.id, amount: new Prisma.Decimal(50000), createdBy: cfo } });
  await prisma.arapBill.updateMany({ where: { id: { in: [ar001.id, rc.id] } }, data: { writtenOff: new Prisma.Decimal(50000) } });

  console.log('== 11. 发票台账 ==');
  await prisma.invoice.createMany({
    data: [
      { tenantId, io: 1, invoiceNo: 'SA-20260112', partnerId: ptn['C001'], date: d('2026-01-12'), itemName: '智能设备销售', amount: new Prisma.Decimal(200000), taxRate: new Prisma.Decimal(0.13), taxAmount: new Prisma.Decimal(26000), total: new Prisma.Decimal(226000), arapBillId: ar001.id, createdBy: userIds.get('cfo')! },
      { tenantId, io: 1, invoiceNo: 'SA-20260205', partnerId: ptn['C002'], date: d('2026-02-05'), itemName: '软件授权许可', amount: new Prisma.Decimal(150000), taxRate: new Prisma.Decimal(0.13), taxAmount: new Prisma.Decimal(19500), total: new Prisma.Decimal(169500), createdBy: userIds.get('cfo')! },
      { tenantId, io: 2, invoiceNo: 'PA-20260115', partnerId: ptn['S001'], date: d('2026-01-15'), itemName: '原材料采购', amount: new Prisma.Decimal(150000), taxRate: new Prisma.Decimal(0.13), taxAmount: new Prisma.Decimal(19500), total: new Prisma.Decimal(169500), createdBy: userIds.get('cfo')! },
    ],
  });

  console.log('== 12. 费用报销 ==');
  const payVoucher = await prisma.voucher.create({
    data: {
      tenantId, periodId: periodMap.get('2026-2')!, word: '付', no: nextNo(periodMap.get('2026-2')!), date: d('2026-02-26'),
      status: 2, totalDebit: new Prisma.Decimal(6800), totalCredit: new Prisma.Decimal(6800),
      memo: '费用报销-出差深圳', sourceType: 1, createdBy: userIds.get('lisi')!, auditedBy: cfo, auditedAt: d('2026-02-26'),
      entries: { create: [
        { lineNo: 1, summary: '报销-出差深圳差旅', subjectId: sid('560202'), debit: new Prisma.Decimal(6800), credit: new Prisma.Decimal(0), departmentId: deptId.get('d03') },
        { lineNo: 2, summary: '支付报销款', subjectId: sid('100201'), debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(6800), settleType: '转账', settleNo: 'BX-202602-0002' },
      ] },
    },
  });
  await prisma.expenseClaim.create({
    data: {
      tenantId, claimNo: 'BX-202602-0001', applicantId: userIds.get('wangwu')!, deptId: deptId.get('d01'),
      title: '1月市内交通与办公用品', total: new Prisma.Decimal(2860), status: 0, currentNode: null, createdBy: userIds.get('wangwu')!,
      items: { create: [
        { expenseType: '交通费', occurDate: d('2026-02-20'), amount: new Prisma.Decimal(460), invoiceCount: 3, remark: '市内出差打车' },
        { expenseType: '办公费', occurDate: d('2026-02-22'), amount: new Prisma.Decimal(2400), invoiceCount: 1, remark: '打印耗材' },
      ] },
    },
  });
  const claim2 = await prisma.expenseClaim.create({
    data: {
      tenantId, claimNo: 'BX-202602-0002', applicantId: userIds.get('wangwu')!, deptId: deptId.get('d03'),
      title: '出差深圳(客户拜访)', total: new Prisma.Decimal(6800), status: 4, currentNode: '出纳付款', createdBy: userIds.get('wangwu')!,
      payVoucherId: payVoucher.id, paidAt: d('2026-02-26'),
      items: { create: [
        { expenseType: '差旅费', occurDate: d('2026-02-24'), amount: new Prisma.Decimal(5800), invoiceCount: 4, remark: '高铁+住宿' },
        { expenseType: '业务招待费', occurDate: d('2026-02-25'), amount: new Prisma.Decimal(1000), invoiceCount: 1, remark: '宴请客户' },
      ] },
    },
  });
  await prisma.approvalRecord.createMany({
    data: [
      { claimId: claim2.id, approverId: userIds.get('wangwu')!, approverName: '王五', action: 'submit', createdAt: d('2026-02-23') },
      { claimId: claim2.id, approverId: userIds.get('boss')!, approverName: '赵总', action: 'approve', opinion: '同意', createdAt: d('2026-02-24') },
      { claimId: claim2.id, approverId: userIds.get('boss')!, approverName: '赵总', action: 'approve', opinion: '大额复核通过', createdAt: d('2026-02-24') },
      { claimId: claim2.id, approverId: userIds.get('cfo')!, approverName: '陈主管', action: 'approve', opinion: '财务复核通过', createdAt: d('2026-02-25') },
      { claimId: claim2.id, approverId: userIds.get('lisi')!, approverName: '李四', action: 'pay', createdAt: d('2026-02-26') },
    ],
  });
  await prisma.expenseClaim.create({
    data: {
      tenantId, claimNo: 'BX-202602-0003', applicantId: userIds.get('zhangsan')!, deptId: deptId.get('d02'),
      title: '2月财务培训费', total: new Prisma.Decimal(3200), status: 1, currentNode: '部门审批', createdBy: userIds.get('zhangsan')!,
      items: { create: [{ expenseType: '培训费', occurDate: d('2026-02-25'), amount: new Prisma.Decimal(3200), invoiceCount: 1 }] },
    },
  });
  await prisma.approvalRecord.create({ data: { claimId: await prisma.expenseClaim.findFirstOrThrow({ where: { tenantId, claimNo: 'BX-202602-0003' } }).then((x) => x.id), approverId: userIds.get('zhangsan')!, approverName: '张三', action: 'submit' } });

  console.log('== 13. 银行对账单演示(2月,含两笔未达账项)==');
  const bankAccountId = 1;
  await prisma.statementLine.deleteMany({ where: { tenantId } });
  await prisma.statementLine.createMany({
    data: [
      { tenantId, accountId: bankAccountId, date: d('2026-02-08'), amount: new Prisma.Decimal(50000), memo: '华辰科技货款过桥', importedBy: userIds.get('lisi')! },
      { tenantId, accountId: bankAccountId, date: d('2026-02-20'), amount: new Prisma.Decimal(-3600), memo: '办公用品支付', importedBy: userIds.get('lisi')! },
      { tenantId, accountId: bankAccountId, date: d('2026-02-25'), amount: new Prisma.Decimal(-80), memo: '账户管理费(企业未入账≠勾兑目标)', importedBy: userIds.get('lisi')! },
      { tenantId, accountId: bankAccountId, date: d('2026-02-28'), amount: new Prisma.Decimal(128.55), memo: '存款利息收入(企业未入账)', importedBy: userIds.get('lisi')! },
    ],
  });

  console.log('== 14. 常用摘要 ==');
  await prisma.summaryLib.createMany({
    data: [
      { tenantId, text: '收到客户货款' }, { tenantId, text: '支付供应商货款' },
      { tenantId, text: '报销差旅费' }, { tenantId, text: '发放工资' },
      { tenantId, text: '缴纳增值税' },
    ].map((x) => ({ ...x, usageCount: 5 })),
    skipDuplicates: true,
  });

  console.log('\n✅ 演示数据完成');
  console.table(users.map((u) => ({ 账号: u.username, 密码: u.password, 姓名: u.realName, 角色: u.roleCode })));
  console.log(`\n账套: ${SEED_TENANT_NAME} (启用期 ${SEED_TENANT_START_YEAR}-${String(SEED_TENANT_START_MONTH).padStart(2, '0')})`);
  console.log('登录入口: http://localhost:5173 (vite dev) 或部署后由 Nginx 代理到后端 :3000');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
