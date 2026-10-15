/**
 * 端到端验证脚本:覆盖系统核心流程
 * 前置:后端已启动于 BASE_URL,数据库已执行 db:reset
 * 运行:node scripts/e2e.mjs   (退出码 0 = 全部通过)
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100/api/v1';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}  ${detail}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function login(username, password) {
  const r = await api('POST', '/auth/login', { body: { username, password } });
  if (r.code !== 0) throw new Error(`登录失败 ${username}: ${r.message}`);
  return r.data.accessToken;
}

async function main() {
  console.log('== 1. 认证与权限 ==');
  const cfoToken = await login('cfo', 'Cfo@123');
  const accToken = await login('zhangsan', 'Acc@123');
  const empToken = await login('wangwu', 'Emp@123');
  assert(true, 'cfo/zhangsan/wangwu 登录成功');

  const badLogin = await api('POST', '/auth/login', { body: { username: 'cfo', password: 'wrong' } });
  assert(badLogin.code !== 0, '错误密码被拒绝');

  const noPerm = await api('POST', '/vouchers', {
    token: empToken,
    body: { date: '2026-02-25', entries: [{ summary: 'a', subjectId: 1 }, { summary: 'b', subjectId: 1 }] },
  });
  assert(noPerm.status === 403 || noPerm.code === 40300, '员工无凭证录入权限(RBAC 拦截)', JSON.stringify(noPerm));

  const unauth = await api('GET', '/periods');
  assert(unauth.status === 401, '未登录访问被拒绝(401)');

  console.log('== 2. 基础数据 ==');
  const periods = await api('GET', '/periods', { token: cfoToken });
  assert(periods.code === 0 && periods.data.list.length >= 24, `会计期间生成(${periods.data?.list?.length} 期)`);
  const janClosed = periods.data.list.find((p) => p.year === 2026 && p.month === 1);
  const febOpen = periods.data.list.find((p) => p.year === 2026 && p.month === 2);
  assert(janClosed?.status === 2, '2026-01 已结账');
  assert(febOpen?.status === 1, '2026-02 进行中');

  const tree = await api('GET', '/subjects/tree', { token: cfoToken });
  assert(tree.code === 0 && tree.data.list.length >= 60, `科目表预置(${tree.data?.list?.length} 个)`);
  const partners = await api('GET', '/partners?page=1&pageSize=50', { token: cfoToken });
  assert(partners.data.total >= 4, `往来单位(${partners.data?.total} 家)`);

  console.log('== 3. 凭证全流程(录入→提交→审核→反审核→红冲)==');
  // 借贷不平被拒
  const unbalanced = await api('POST', '/vouchers', {
    token: accToken,
    body: {
      date: '2026-02-25',
      memo: 'E2E不平衡测试',
      entries: [
        { summary: '借方', subjectCode: 'x' },
      ],
    },
  });
  assert(unbalanced.code !== 0, '非法分录被拒绝');
  // 正常创建
  const subjects = tree.data.list;
  const bank = subjects.find((s) => s.code === '100201');
  const admin560201 = subjects.find((s) => s.code === '560201');
  const depts = await api('GET', '/departments', { token: cfoToken });
  const finDept = depts.data.find((d) => d.name === '财务部');
  const created = await api('POST', '/vouchers', {
    token: accToken,
    body: {
      date: '2026-02-26',
      memo: 'E2E测试凭证-支付测试费',
      attachmentCount: 1,
      entries: [
        { summary: '支付测试费', subjectId: admin560201.id, debit: 500, credit: 0, departmentId: finDept.id },
        { summary: '银行支付', subjectId: bank.id, debit: 0, credit: 500, settleType: '转账' },
      ],
    },
  });
  assert(created.code === 0, `凭证创建(#${created.data?.id})`, JSON.stringify(created));
  const vid = created.data.id;

  // 制单人不能审核同一张(R7)
  const selfAudit = await api('POST', `/vouchers/${vid}/approve`, { token: accToken });
  assert(selfAudit.code !== 0, '制单人与审核人相同被拒(R7)');

  // 提交 → CFO 审核
  const submit = await api('POST', `/vouchers/${vid}/submit`, { token: accToken });
  assert(submit.code === 0, '凭证提交审核');
  const approve = await api('POST', `/vouchers/${vid}/approve`, { token: cfoToken });
  assert(approve.code === 0 && approve.data.status === 2, '财务主管审核记账(status=2)');

  // 已记账不可修改
  const editPosted = await api('PUT', `/vouchers/${vid}`, {
    token: accToken,
    body: { date: '2026-02-26', entries: [] },
  });
  assert(editPosted.code !== 0, '已记账凭证禁止修改(R6)');

  // 反审核 → 再审核
  const cancelAudit = await api('POST', `/vouchers/${vid}/cancel-audit`, { token: cfoToken });
  assert(cancelAudit.code === 0, '反审核成功');
  await api('POST', `/vouchers/${vid}/submit`, { token: accToken });
  const approve2 = await api('POST', `/vouchers/${vid}/approve`, { token: cfoToken });
  assert(approve2.code === 0, '再次审核记账');

  // 红冲
  const red = await api('POST', `/vouchers/${vid}/red-flush`, { token: accToken, body: { date: '2026-02-27' } });
  assert(red.code === 0 && Number(red.data.totalDebit) === -500, `红冲生成等额反向凭证(${red.data?.totalDebit})`);
  const redApprove = await api('POST', `/vouchers/${red.data.id}/submit`, { token: accToken })
    .then(() => api('POST', `/vouchers/${red.data.id}/approve`, { token: cfoToken }));
  assert(redApprove.code === 0, '红冲凭证审核记账');

  // 重复红冲被拒
  const redAgain = await api('POST', `/vouchers/${vid}/red-flush`, { token: accToken, body: {} });
  assert(redAgain.code !== 0, '重复红冲被拦截');

  console.log('== 4. 账簿与报表 ==');
  const summary = await api('GET', '/reports/balance-summary?year=2026&month=2', { token: cfoToken });
  const sumD = summary.data.totals.closeDebit;
  const sumC = summary.data.totals.closeCredit;
  assert(Math.abs(sumD - sumC) < 0.01, `科目余额表试算平衡(${sumD} = ${sumC})`);

  const arSubject = subjects.find((s) => s.code === '1122');
  const detail = await api('GET', `/reports/detail-ledger/${arSubject.id}?year=2026&fromMonth=1&toMonth=2`, { token: cfoToken });
  assert(detail.code === 0 && detail.data.lines.length >= 3, `应收账款明细账(${detail.data?.lines?.length} 笔)`);

  const bs = await api('GET', '/reports/balance-sheet?periodId=' + febOpen.id, { token: cfoToken });
  assert(bs.data.balanceCheck.balanced === true, `资产负债表平衡(${bs.data.balanceCheck.asset} = ${bs.data.balanceCheck.liabilityEquity})`);
  const cashRow = bs.data.rows.find((r) => r.rowKey === 'cash');
  assert(Number(cashRow.periodValue) > 200000, `货币资金含银行明细科目(${cashRow.periodValue})`);

  const is = await api('GET', '/reports/income', { token: cfoToken });
  const revenue = is.data.rows.find((r) => r.rowKey === 'revenue');
  const netProfit = is.data.rows.find((r) => r.rowKey === 'net_profit');
  assert(Number(revenue.ytdValue) === 350000, `年累计营业收入(${revenue.ytdValue})`);
  assert(Number(netProfit.ytdValue) === 127600, `年累计净利润含未结转损益(${netProfit.ytdValue})`);

  console.log('== 5. 结账控制 ==');
  const draftVoucher = (await api('GET', '/vouchers?status=0&periodId=' + febOpen.id, { token: cfoToken })).data.list[0];
  if (draftVoucher) {
    const checklistBlocked = await api('GET', `/closing/checklist?periodId=${febOpen.id}`, { token: cfoToken });
    const pendingItem = checklistBlocked.data.items.find((i) => i.key === 'no_pending_voucher');
    assert(pendingItem.pass === false, '存在草稿凭证时结账检查不通过');
    const closeBlocked = await api('POST', '/closing/close', { token: cfoToken, body: { periodId: febOpen.id } });
    assert(closeBlocked.code === 42008, '带未处理凭证期间禁止结账(R9)');
  }
  // 向导:结转损益(会因草稿存在先生成,但凭证为待审核状态不影响)
  const carry = await api('POST', '/closing/profit-carryforward', { token: cfoToken, body: { periodId: febOpen.id } });
  assert(carry.code === 0 || carry.message?.includes('已存在'), `结转损益向导(${carry.code === 0 ? `净利 ${carry.data?.netProfit}` : carry.message})`);
  const dupCarry = await api('POST', '/closing/profit-carryforward', { token: cfoToken, body: { periodId: febOpen.id } });
  assert(dupCarry.code !== 0, '重复结转被拦截');

  console.log('== 6. 应收应付与发票 ==');
  const aging = await api('GET', '/arap/aging?type=1', { token: cfoToken });
  assert(aging.code === 0 && aging.data.list.length >= 2, `应收账龄分析(${aging.data?.list?.length} 客户)`);
  const vat = await api('GET', '/invoices/vat-summary?year=2026', { token: cfoToken });
  assert(vat.code === 0 && vat.data.payableVat === 26000, `增值税统计 销项-进项=${vat.data?.payableVat}`);

  console.log('== 7. 资金与银行对账 ==');
  const journals = await api('GET', '/fund/journals?year=2026&month=2', { token: cfoToken });
  assert(journals.code === 0 && journals.data.list.length >= 4, `资金日记账(${journals.data?.list?.length} 笔)`);
  const autoMatch = await api('POST', '/fund/reconciliations/auto-match', { token: cfoToken, body: { accountId: 1 } });
  assert(autoMatch.code === 0 && autoMatch.data.matched >= 2, `自动勾兑(${autoMatch.data?.matched} 笔)`);
  const recon = await api('GET', '/fund/reconciliation?accountId=1&year=2026&month=2', { token: cfoToken });
  assert(recon.code === 0 && recon.data.unmatchedLines.length === 2, `余额调节表未达账项(${recon.data?.unmatchedLines?.length} 笔)`);

  console.log('== 8. 费用报销审批流 ==');
  const myClaims = await api('GET', '/expense-claims?scope=mine', { token: empToken });
  assert(myClaims.code === 0 && myClaims.data.list.length >= 2, `员工本人报销单(${myClaims.data?.total} 张)`);
  // 新建报销单并走完整审批流
  // 发生日期须落在账套"当前业务期间"内:后端时效校验以账套当前开启期间为业务时钟,
  // 演示账套开启期为 2026-02,故固定取期间内日期(用系统今天会因冻结账套被判"晚于今天")
  const occurDate = '2026-02-15';
  const newClaim = await api('POST', '/expense-claims', {
    token: empToken,
    body: {
      title: 'E2E测试报销-办公用品',
      deptId: finDept.id,
      items: [{ expenseType: '办公费', occurDate, amount: 800, invoiceCount: 2 }],
    },
  });
  assert(newClaim.code === 0, '员工填报报销单', newClaim.message ?? '');
  if (newClaim.code !== 0 || !newClaim.data?.id) {
    throw new Error(`报销单创建失败,中止后续审批流断言: ${newClaim.message}`);
  }
  await api('POST', `/expense-claims/${newClaim.data.id}/submit`, { token: empToken });
  // 财务主管审批(800 < 阈值5000 → 提交后直达财务复核 status=2,批一次即到待付款 status=4)
  const decided = await api('POST', `/expense-claims/${newClaim.data.id}/decide`, { token: cfoToken, body: { action: 'approve' } });
  assert(decided.code === 0 && decided.data.status === 4, `财务复核通过(状态 ${decided.data?.status} → 待付款)`);
  // 已到待付款后重复审批应被拒绝
  const decided2 = await api('POST', `/expense-claims/${newClaim.data.id}/decide`, { token: cfoToken, body: { action: 'approve' } });
  assert(decided2.code !== 0, '重复审批被拦截');
  // 出纳付款生成凭证:凭证日期必须落在开启中的期间(2026-02),不传则默认真实今天会落入未开启期间
  const pay = await api('POST', `/expense-claims/${newClaim.data.id}/pay`, { token: await login('lisi', 'Cash@123'), body: { settleSubjectCode: '100201', date: '2026-02-26' } });
  assert(pay.code === 0, `出纳付款并自动生成凭证(#${pay.data?.voucherId})`);

  console.log('== 9. 固定资产与折旧 ==');
  const assets = await api('GET', '/assets', { token: cfoToken });
  assert(assets.data.list.length === 3, `资产卡片(${assets.data.list.length} 项)`);
  const laptop = assets.data.list.find((a) => a.name.includes('笔记本'));
  assert(laptop.monthlyDepreciation > 900 && laptop.monthlyDepreciation < 1000, `月折旧额计算(${laptop.monthlyDepreciation})`);

  console.log('== 10. 看板与日志 ==');
  const dash = await api('GET', '/dashboard/summary', { token: await login('boss', 'Boss@123') });
  assert(dash.code === 0 && dash.data.currentPeriod.revenue > 0, `经营看板(本期收入 ${dash.data?.currentPeriod?.revenue})`);
  const logs = await api('GET', '/operation-logs?page=1&pageSize=5', { token: await login('admin', 'Admin@123') });
  assert(logs.code === 0 && logs.data.total > 10, `操作日志留痕(${logs.data?.total} 条)`);

  console.log('\n========== E2E 结果 ==========');
  console.log(`通过 ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.log('失败项:', failures.join(' | '));
    process.exit(1);
  }
  console.log('🎉 全部通过');
}

main().catch((e) => {
  console.error('E2E 异常终止:', e);
  process.exit(1);
});
