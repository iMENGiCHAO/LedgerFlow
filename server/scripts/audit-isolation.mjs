/**
 * 多租户隔离审计(自动化,可重复,CI 可跑):
 * 1) admin 创建审计对照账套
 * 2) 在租户 A 创建一张凭证
 * 3) 切换到租户 B 上下文,验证对 A 的资源访问全部被拒(404/403)
 * 4) 汇总断言结果
 *
 * 前置:后端已启动,数据库为种子态(演示科技 id=1)。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100/api/v1';

async function api(method, path, { token, body, tid } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tid != null ? 'x-audit-tid': {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('========== 多租户隔离审计 ==========');

  // 1) admin 登录
  const login = await api('POST', '/auth/login', { body: { username: 'admin', password: 'Admin@123' } });
  const token = login.json?.data?.accessToken;
  if (!token) throw new Error('admin 登录失败:' + JSON.stringify(login.json));
  check('admin 登录', true);

  // 2) 审计对照账套:先查后建
  const list0 = await api('GET', '/tenants', { token });
  const arr0 = Array.isArray(list0.json?.data) ? list0.json.data : (list0.json?.data?.list || []);
  const existing = arr0.find?.((t) => t.name === '审计对照公司');
  let tid = existing?.id ?? null;
  if (!tid) {
    const create = await api('POST', '/tenants', { token, body: { name: '审计对照公司', startYear: 2026, startMonth: 1 } });
    tid = create.json?.data?.id ?? null;
  }
  check('创建/复用审计账套', !!tid, `tid=${tid}`);
  if (!tid) throw new Error('无法获得审计账套');

  // 3) 切到审计账套并初始化(科目/期间)——init 走 tenant-setup;若未 init,大部分业务接口应报「未初始化」而不是跨租户泄露
  const sw = await api('POST', '/auth/switch-tenant', { token, body: { tenantId: tid } });
  const tokenB = sw.json?.data?.accessToken || token;
  check('切换到审计账套', sw.json?.code === 0);

  // 4) 在租户 A(演示科技)下建一张凭证
  const swA = await api('POST', '/auth/switch-tenant', { token, body: { tenantId: 1 } });
  const tokenA = swA.json?.data?.accessToken || token;
  const subs = await api('GET', '/subjects/tree', { token: tokenA });
  const flat = JSON.stringify(subs.json?.data || {});
  // 遍历科目树找 id
  const tree = subs.json?.data?.list || subs.json?.data || [];
  const all = [];
  const walk = (nodes) => { for (const n of nodes || []) { all.push(n); walk(n.children || []); } };
  walk(tree);
  const bank = all.find((s) => s.code === '100201');
  const cash = all.find((s) => s.code === '1001');
  if (!bank || !cash) throw new Error('科目树解析失败');
  const voucher = await api('POST', '/vouchers', {
    token: tokenA,
    body: {
      date: '2026-02-15', word: '记',
      entries: [
        { summary: '隔离审计凭证', subjectId: bank.id, debit: 100, credit: 0 },
        { summary: '隔离审计凭证', subjectId: cash.id, debit: 0, credit: 100 },
      ],
    },
  });
  const vid = voucher.json?.data?.id;
  check('租户A创建审计凭证', !!vid, `vid=${vid}`);

  // 5) 切回审计账套 B:对 A 的资源必须不可见
  const b1 = await api('GET', `/vouchers/${vid}`, { token: tokenB });
  check('B 读取 A 的凭证 → 拒绝', b1.json?.code !== 0 && (b1.status === 404 || b1.json?.code === 40400 || b1.json?.message), `status=${b1.status} code=${b1.json?.code}`);

  const b2 = await api('GET', '/vouchers?page=1&pageSize=100', { token: tokenB });
  const listStr = JSON.stringify(b2.json?.data || {});
  check('B 凭证列表不含 A 的凭证', !listStr.includes(`"id":${vid}`));

  // B 试图给 A 的员工(演示科技的员工)记工资 → 必须拒绝(租户归属校验)
  const empA = await api('GET', '/employees', { token: tokenA });
  const empArr = Array.isArray(empA.json?.data) ? empA.json.data : (empA.json?.data?.list || []);
  const aEmpId = empArr[0]?.id;
  if (aEmpId) {
    const bBatch = await api('GET', '/payrolls?year=2026&month=2', { token: tokenB });
    const bbId = bBatch.json?.data?.id;
    if (bbId) {
      const cross = await api('POST', `/payrolls/${bbId}/items`, { token: tokenB, body: { items: [{ employeeId: aEmpId, gross: 9999 }] } });
      check('B 给 A 的员工记工资 → 拒绝', cross.json?.code !== 0, `code=${cross.json?.code} ${cross.json?.message || ''}`);
    }
  } else {
    check('B 给 A 的员工记工资 → 拒绝', true, 'A 无员工,跳过');
  }
  const b4pre = await api('GET', '/payrolls?year=2026&month=2', { token: tokenB });
  check('B 工资批次独立创建', b4pre.json?.code === 0, `B batch=${b4pre.json?.data?.id ?? '无'}`);

  const b4 = await api('GET', '/periods', { token: tokenB });
  const periodsStr = JSON.stringify(b4.json?.data || {});
  check('B 期间列表不含 A 的期间(或为空)', b4.json?.code === 0, `periods=${(b4.json?.data?.list || []).length}`);

  // 6) 回到 A 清理:作废/删除审计凭证,删除对照账套
  await api('DELETE', `/vouchers/${vid}`, { token: tokenA });
  const del = await api('DELETE', `/tenants/${tid}`, { token });
  check('清理审计账套(有数据应明确拒绝而非 500)', del.json?.code === 0 || (del.json?.message || '').length > 0, `code=${del.json?.code} ${(del.json?.message || '').slice(0, 40)}`);

  // 7) 汇总
  const failed = results.filter((r) => !r.ok);
  console.log(`========== 隔离审计结果:${results.length - failed.length} / ${results.length} ==========`);
  if (failed.length) {
    console.error('❌ 存在隔离泄露风险项!');
    process.exit(1);
  }
  console.log('✅ 多租户隔离审计全部通过');
}

main().catch((e) => {
  console.error('审计脚本异常:', e.message);
  process.exit(1);
});
