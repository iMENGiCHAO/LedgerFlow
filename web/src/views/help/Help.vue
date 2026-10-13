<template>
  <div class="help-page">
    <PageHeader
      title="使用说明"
      subtitle="按角色分:登录账号不同,看到的菜单和能做的事不同 — 这里告诉您每一步怎么操作"
      icon="Reading"
    >
      <template #actions>
        <el-tag v-if="currentUser" :type="roleTone" size="large" effect="dark">
          当前角色:{{ roleName }}
        </el-tag>
      </template>
    </PageHeader>

    <div class="help-layout">
      <!-- 左侧目录 -->
      <aside class="help-toc">
        <el-input v-model="search" placeholder="搜索章节..." clearable size="default" class="search-input">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-menu :default-active="activeId" @select="scrollTo" class="toc-menu" :collapse="false">
          <el-menu-item
            v-for="item in filteredToc"
            :key="item.id"
            :index="item.id"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </aside>

      <!-- 右侧内容 -->
      <main class="help-content">
        <!-- 快速登录卡 -->
        <SectionCard id="quick-start" title="5 分钟快速登录" icon="Promotion">
          <p>打开浏览器访问 <code>http://localhost:5173</code>,用下面任一账号登录:</p>
          <el-table :data="loginAccounts" stripe border>
            <el-table-column prop="label" label="角色" width="110" />
            <el-table-column prop="username" label="账号" width="100">
              <template #default="{ row }">
                <code class="cred">{{ row.username }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="password" label="密码" width="100">
              <template #default="{ row }">
                <code class="cred">{{ row.password }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="permissions" label="权限" />
            <el-table-column prop="typical" label="典型操作" />
            <el-table-column label="登录" width="80" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="quickLogin(row)">填充</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-alert type="info" :closable="false" show-icon style="margin-top: 12px">
            演示账套「北京智云科技股份有限公司」已预置 2026 年 1-2 月完整业务数据:1 月已结账,2 月进行中。
            首次登录后请到「个人中心」改密码。
          </el-alert>
        </SectionCard>

        <!-- 角色说明(根据登录角色显示对应章节) -->
        <template v-for="role in visibleRoles" :key="role.id">
          <SectionCard
            :id="`role-${role.id}`"
            :title="`角色 ${role.id} · ${role.name}`"
            :icon="role.icon"
          >
            <el-alert v-if="!isCurrentRole(role.id)" type="info" :closable="false" show-icon style="margin-bottom: 14px">
              您当前不是该角色,以下是该角色的能力说明(参考用)
            </el-alert>
            <div v-html="role.content" class="rich-text"></div>
          </SectionCard>
        </template>

        <!-- 通用部分 -->
        <SectionCard id="common" title="通用功能(每个角色都会用)" icon="Tools">
          <el-collapse v-model="activeCollapse">
            <el-collapse-item name="pwd" title="改密码">
              <p>右上角头像 → 修改密码 → 输旧 + 新 → 保存。改完会跳回登录页,重新用新密码登。</p>
            </el-collapse-item>
            <el-collapse-item name="tenant" title="切账套">
              <p>右上角下拉(显示当前账套名)→ 选目标账套 → 切换。整页数据刷新,数据完全隔离。</p>
              <p><strong>前提</strong>:您必须被授权访问该账套(admin 在「用户管理」里勾选可见账套)。</p>
            </el-collapse-item>
            <el-collapse-item name="export" title="导出 Excel">
              <p>任意列表页右上角「导出」按钮 → 浏览器下载 .xlsx → 双击打开(支持 Mac Excel / WPS / 微软 Excel)。</p>
              <p>导出的文件包含完整数据 + 公司抬头 + 表头样式,直接拿去上报或归档。</p>
            </el-collapse-item>
            <el-collapse-item name="health" title="健康检查 / 出错排查">
              <p>访问 <code>/system/health</code>(admin/cfo 可见),一键 ping 所有关键接口,出错会显示具体哪个失败。</p>
              <p>如果「导出 Excel」下载 0KB 或打开空白,先去健康检查页看导出端点状态。</p>
            </el-collapse-item>
          </el-collapse>
        </SectionCard>

        <!-- FAQ -->
        <SectionCard id="faq" title="常见问题 FAQ" icon="QuestionFilled">
          <el-collapse v-model="activeFaq">
            <el-collapse-item name="q1" title="凭证保存按钮是灰的?">
              <p>三选一原因:</p>
              <ol>
                <li>借贷不平(底部差额显示 ≠ 0)</li>
                <li>选了非末级科目(必须是叶子节点)</li>
                <li>带 ⚠ 标记的科目没填辅助核算(部门/项目/往来单位)</li>
              </ol>
            </el-collapse-item>
            <el-collapse-item name="q2" title="审核报『制单人与审核人相同』?">
              <p>这是内控硬规则。系统管理员也不能改 — 必须换其他财务账号审核。</p>
              <p>设计上要求:录凭证的人和审核凭证的人不能是同一个人(财务不相容岗位分离原则)。</p>
            </el-collapse-item>
            <el-collapse-item name="q3" title="结账按钮报错?">
              <p>到「期末处理」看检查清单,四项必须全绿:</p>
              <ul>
                <li>✓ 上期已结账</li>
                <li>✓ 无草稿/待审凭证</li>
                <li>✓ 损益已结转(系统自动生成"转"字凭证)</li>
                <li>✓ 试算平衡(所有末级科目借贷合计相等)</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item name="q4" title="资产负债表会不会不平?">
              <p>不会。系统设计保证「未分配利润」= 3103/3104 余额 + 当年未结转损益,因此任何时刻都平衡。</p>
              <p>如果看到不平衡 — 截图 + 复现步骤,这是 P0 级别 bug,需要立即修复。</p>
            </el-collapse-item>
            <el-collapse-item name="q5" title="反审核/反结账点不动?">
              <ul>
                <li><strong>反审核</strong>:期间必须未结账 + 该凭证未被下游单据(应收/付款/资产)引用</li>
                <li><strong>反结账</strong>:下一个期间没有录入任何凭证(安全阀,防止数据穿越)</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item name="q6" title="手机上能用吗?">
              <p>能。手机浏览器直接访问 <code>http://&lt;电脑IP&gt;:5173</code>(电脑和手机连同 Wi-Fi),界面自适应,底部 TabBar 导航。</p>
            </el-collapse-item>
            <el-collapse-item name="q7" title="导出 Excel 打不开?">
              <ol>
                <li>先到 <code>/system/health</code> 看导出端点是否 200</li>
                <li>用 Mac Excel 2016+ / WPS / 微软 Office 2016+ 打开</li>
                <li>如果文件能打开但内容空白,可能是后端返回 JSON 错误(已被前端 exportExcel 工具解析为 toast 弹错)</li>
                <li>实在不行联系 admin 看后端日志</li>
              </ol>
            </el-collapse-item>
            <el-collapse-item name="q8" title="数据安全?">
              <ul>
                <li>密码 bcrypt 加密存储(不可逆)</li>
                <li>敏感操作全部留痕(操作日志)</li>
                <li>JWT 黑名单(登出立即失效)</li>
                <li>越权防御(11 处 findFirst tenantId 校验)</li>
                <li>登录限流(3次/分,5次/30分)</li>
                <li>定期「系统管理 → 数据备份」下载 .dump 文件,异地保存</li>
              </ul>
            </el-collapse-item>
          </el-collapse>
        </SectionCard>

        <!-- 数据安全 -->
        <SectionCard id="security" title="数据安全" icon="Lock">
          <p>系统按金融级安全标准设计:</p>
          <el-table :data="securityItems" border>
            <el-table-column prop="name" label="能力" width="160" />
            <el-table-column prop="value" label="具体做法" />
          </el-table>
          <el-alert type="warning" :closable="false" show-icon style="margin-top: 14px">
            <strong>生产环境必做</strong>:
            <ol style="margin: 4px 0; padding-left: 20px">
              <li>启用 HTTPS(Let's Encrypt 免费)</li>
              <li>改 <code>server/.env</code> 的 <code>JWT_SECRET</code> 为强随机(≥ 32 字符)</li>
              <li>改 <code>DATABASE_URL</code> 密码</li>
              <li>设置 <code>web/.env</code> 的 <code>VITE_ENABLE_DEMO=false</code>(隐藏演示账号)</li>
              <li>admin 账号立即改默认密码</li>
              <li>防火墙只开 80/443,后端 3100 只 listen 127.0.0.1</li>
              <li>数据库每日自动备份 + 异地存储</li>
            </ol>
          </el-alert>
        </SectionCard>

        <!-- 求助 -->
        <SectionCard id="contact" title="求助" icon="Service">
          <p>遇到问题按以下顺序排查:</p>
          <ol>
            <li>本页面搜索关键词(右上搜索框)</li>
            <li>健康检查页 <code>/system/health</code></li>
            <li>查看操作日志 <code>/system/logs</code>(admin 可见)</li>
            <li>查看项目文档(在项目根目录 <code>docs/</code> 文件夹)</li>
            <li>联系开发</li>
          </ol>
        </SectionCard>

        <p class="version">v1.0 · 2026-08-29</p>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Search, Promotion, UserFilled, Avatar, Wallet, Coin, OfficeBuilding, Reading,
  Tools, QuestionFilled, Lock, Service,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const search = ref('')
const activeCollapse = ref(['pwd', 'tenant', 'export', 'health'])
const activeFaq = ref<string[]>([])
const activeId = ref('quick-start')

const currentUser = computed(() => auth.user)
const isSuper = computed(() => !!auth.user?.isSuper)

const roleName = computed(() => {
  if (!currentUser.value) return '未登录'
  if (isSuper.value) return '系统管理员'
  // 简化判断,根据 perm 数
  const perms = currentUser.value.perms || []
  if (perms.includes('voucher:audit') && perms.includes('closing:run')) return '财务主管'
  if (perms.includes('voucher:create') && !perms.includes('voucher:audit')) return '会计'
  if (perms.includes('fund:manage')) return '出纳'
  if (perms.length === 1 && perms[0] === 'expense:create') return '员工'
  if (perms.length <= 3 && perms.includes('dashboard:view')) return '总经理'
  return '其他角色'
})

const roleTone = computed(() => {
  return {
    '系统管理员': 'danger',
    '财务主管': 'warning',
    '会计': 'primary',
    '出纳': 'success',
    '员工': 'info',
    '总经理': '',
  }[roleName.value] || ''
})

const isCurrentRole = (id: string) => {
  const map: Record<string, string> = {
    'admin': '系统管理员',
    'cfo': '财务主管',
    'zhangsan': '会计',
    'lisi': '出纳',
    'wangwu': '员工',
    'boss': '总经理',
  }
  return roleName.value === map[id]
}

// 角色内容(精简版 — 完整版看 docs/系统使用说明.md)
const rolesContent: Record<string, { id: string; name: string; icon: any; content: string }> = {
  admin: {
    id: 'admin', name: '系统管理员', icon: UserFilled,
    content: `
      <h4>您能看到的菜单</h4>
      <p>系统管理 / 用户管理 / 角色权限 / 账套管理 / 操作日志 / 数据备份 + 所有业务模块(全权限)</p>
      <h4>您的工作</h4>
      <ol>
        <li><strong>初始化</strong> — 新建账套、设置启用期间、灌科目表</li>
        <li><strong>用户管理</strong> — 新建/停用用户、分配角色和可见账套、重置密码</li>
        <li><strong>角色权限</strong> — 调整角色权限勾选、新建自定义角色</li>
        <li><strong>账套管理</strong> — 改公司名、税号、地址、法人、启停账套、删除空账套</li>
        <li><strong>审计</strong> — 操作日志查询(谁在什么时候改了啥)</li>
        <li><strong>备份</strong> — 一键备份数据库,下载 .dump 文件</li>
      </ol>
      <h4>账套管理实战</h4>
      <p><strong>改公司信息</strong>:<code>账套管理</code> → 当前账套卡 → 改名称/税号/地址/法人 → <code>保存</code>。</p>
      <p><strong>新建账套</strong>:<code>账套管理</code> → <code>我的账套</code> 上方 → <code>新建账套</code> → 填名称、税号、启用年/月 → 保存(进入"未启用"状态)。</p>
      <p><strong>启用账套</strong>:<em>必须先录入期初</em> → <code>期初建账</code> → 填末级科目期初借/贷方 → 借贷相等 → 回到账套管理 → 启停按钮 → 二次确认。</p>
      <p><strong>停用账套</strong>:<code>账套管理</code> → 启停按钮 → 二次确认 → 期间解锁。</p>
      <p><strong>删除账套</strong>:仅超管可删,必须先停用 + 无任何业务数据。系统自动校验,有数据会拒绝。</p>
    `,
  },
  cfo: {
    id: 'cfo', name: '财务主管', icon: Avatar,
    content: `
      <h4>您能看到的菜单</h4>
      <p>经营看板 / 凭证审核 / 期末处理 / 全部报表 / 资金管理 / 应收应付 / 发票 / 资产 / 报销审批(总经理节点)</p>
      <h4>您的工作</h4>
      <ol>
        <li><strong>审核凭证</strong> — 待审 → 审核记账(注意制单人和审核人不能是同一个人)</li>
        <li><strong>反审核</strong> — 期间未结 + 无下游单据引用 → 才能反审</li>
        <li><strong>结转损益</strong> — 每月末一次,自动生成"转"字凭证</li>
        <li><strong>计提折旧</strong> — 每月末一次,自动对全部在用资产</li>
        <li><strong>期末结账</strong> — 四项闸门全过才能关期间</li>
        <li><strong>复核报表</strong> — 资产负债表(任何时刻都应平衡)、利润表(本期+年累计)</li>
      </ol>
      <h4>月末固定动作(顺序执行)</h4>
      <pre>1. 结转损益 → 自动按科目+辅助维度分组,生成"转"字凭证
2. 计提折旧 → 平均年限法,当月新增不提,提足自停
3. 期末处理 → 检查清单 4 项
4. 执行结账 → 期间关闭</pre>
      <h4>红冲(发现已记账凭证做错)</h4>
      <p>凭证列表 → 找到那张凭证 → <code>红冲</code> → 选日期(必须在同一启用期间)→ 系统生成一张<strong>反向</strong>新凭证 → 正常提交+审核。原凭证保留(审计轨迹完整)。</p>
      <p>⚠️ 同一张凭证只能被红冲一次。</p>
    `,
  },
  zhangsan: {
    id: 'zhangsan', name: '会计', icon: Wallet,
    content: `
      <h4>您能看到的菜单</h4>
      <p>经营看板 / 凭证录入 / 凭证查询(本人录的) / 应收应付 / 发票 / 资产 / 期末折旧计提</p>
      <h4>您的工作</h4>
      <ol>
        <li><strong>录凭证</strong> — 凭证管理 → 新增</li>
        <li><strong>核销</strong> — 应收单 / 收款单多对多勾兑</li>
        <li><strong>发票登记</strong> — 进项/销项,可批量导入 CSV</li>
        <li><strong>资产卡片</strong> — 录入固定资产</li>
        <li><strong>折旧计提</strong> — 月末计提(财务主管复核)</li>
      </ol>
      <h4>录凭证的技巧</h4>
      <pre>1. 凭证管理 → 新增
2. 选日期(必须在启用期间内,否则拒绝)
3. 凭证字(收/付/转),序号自动
4. 选科目:
   - 只能选末级科目
   - 输编码或名称搜索
   - 带 ⚠ 标记必须填辅助核算
   - 1002 开头自动出结算方式 + 票据号
5. 输金额:借或贷一边,自动清另一边
6. 实时显示借方合计、贷方合计、差额(必须 = 0)
7. 保存 = 草稿;提交 = 待审</pre>
      <h4>辅助核算快速记</h4>
      <ul>
        <li>应收账款(1122) → 选往来单位</li>
        <li>管理费用-办公费(660102) → 选部门</li>
        <li>制造费用(5101) → 选部门 + 项目</li>
        <li>主营业务收入(6001) → 选部门 + 往来单位</li>
      </ul>
      <p><strong>保存按钮是灰的?</strong> 借贷不平 / 末级 / 辅助核算必填,看底部差额提示。</p>
    `,
  },
  lisi: {
    id: 'lisi', name: '出纳', icon: Coin,
    content: `
      <h4>您能看到的菜单</h4>
      <p>经营看板 / 资金管理 / 银行对账 / 报销付款(已审批通过的)</p>
      <h4>您的工作</h4>
      <ol>
        <li><strong>资金日记账查询</strong> — 现金(1001)/银行(1002)科目的已记账分录</li>
        <li><strong>对账</strong> — 导入网银对账单,自动勾兑(±3 天)</li>
        <li><strong>付款</strong> — 报销单状态"待付款" → 您执行付款 → 自动生成付款凭证</li>
        <li><strong>账户管理</strong> — 新增银行账户(绑定 1002 科目)</li>
      </ol>
      <h4>银行对账流程</h4>
      <pre>1. 资金管理 → 新增账户(选 1002 末级科目)
2. 资金管理 → 导入对账单 → 上传网银导出的 CSV
3. 点"自动勾兑" → 系统按金额 + ±3 天匹配
4. 手工调整未勾对的项
5. 看"余额调节表"</pre>
      <p><strong>勾不上怎么办</strong>:摘要记错 / 跨月(不在 ±3 天) / 金额不等(单位错) → 走"手工勾兑"指定对应账面记录。</p>
      <h4>报销付款</h4>
      <p>报销审批 → 状态筛"待付款" → 点"付款" → 选资金账户 → 系统自动生成付款凭证(借:其他应付款 / 贷:银行存款)。</p>
    `,
  },
  wangwu: {
    id: 'wangwu', name: '员工', icon: OfficeBuilding,
    content: `
      <h4>您能看到的菜单</h4>
      <p>我的报销</p>
      <h4>您的工作</h4>
      <p>只有一件事:报销</p>
      <pre>1. 我的报销 → 新建报销
2. 填标题(例如"8月差旅费")
3. 加明细行:
   - 费用类型(办公/差旅/招待...)
   - 发生日期
   - 金额
   - 发票张数
4. 上传发票照片(jpg/png/pdf,≤10MB)
5. 提交 → 进入审批流
6. 实时看状态</pre>
      <h4>状态对照</h4>
      <table style="width:100%; border-collapse: collapse">
        <tr style="background: #f5f7fa"><th>状态</th><th>含义</th><th>我能做什么</th></tr>
        <tr><td>草稿</td><td>还没提交</td><td>改 / 删 / 提交</td></tr>
        <tr><td>待部门审批</td><td>部门领导在看</td><td>撤回</td></tr>
        <tr><td>待总经理审批</td><td>总经理在看(≥5000 元)</td><td>撤回</td></tr>
        <tr><td>待财务复核</td><td>财务在看</td><td>撤回</td></tr>
        <tr><td>待付款</td><td>出纳付款中</td><td>等</td></tr>
        <tr><td>已付款</td><td>完成</td><td>看</td></tr>
        <tr><td>驳回</td><td>被拒了</td><td>看意见 → 改 → 再提交</td></tr>
        <tr><td>撤回</td><td>自己撤了</td><td>改 → 再提交</td></tr>
      </table>
    `,
  },
  boss: {
    id: 'boss', name: '总经理', icon: Reading,
    content: `
      <h4>您能看到的菜单</h4>
      <p>经营看板 / 我的审批(大额报销)</p>
      <h4>您的工作</h4>
      <p><strong>只审批 ≥ 5000 元的报销</strong>(阈值在系统参数里可调,admin 改)</p>
      <pre>1. 我的审批 → 待我处理
2. 看报销详情 + 发票照片
3. 通过 或 驳回(驳回必填意见)</pre>
      <h4>经营看板</h4>
      <p>打开就是看板,看:</p>
      <ul>
        <li><strong>资金头寸</strong> — 总现金 + 银行存款(分级展示)</li>
        <li><strong>本期数据</strong> — 收入/支出/利润</li>
        <li><strong>应收逾期</strong> — 超 30 天的客户欠款,红色</li>
        <li><strong>12 月收支趋势</strong> — ECharts 折线图</li>
        <li><strong>TOP5 费用</strong> — 哪个部门哪类花得多</li>
        <li><strong>待办计数</strong> — 待我审批 + 待财务复核</li>
      </ul>
    `,
  },
}

const visibleRoles = computed(() => {
  // 按用户角色排序,把当前角色放第一
  const list = Object.values(rolesContent)
  const current = list.find((r) => isCurrentRole(r.id))
  if (current) {
    return [current, ...list.filter((r) => r.id !== current.id)]
  }
  return list
})

const loginAccounts = [
  { id: 'admin', label: '系统管理员', username: 'admin', password: 'Admin@123', permissions: '全部 19 项', typical: '用户/角色/账套/日志/备份' },
  { id: 'cfo', label: '财务主管', username: 'cfo', password: 'Cfo@123', permissions: '14 项', typical: '审核/结账/全部报表' },
  { id: 'zhangsan', label: '会计', username: 'zhangsan', password: 'Acc@123', permissions: '7 项', typical: '录凭证/红冲/核销' },
  { id: 'lisi', label: '出纳', username: 'lisi', password: 'Cash@123', permissions: '3 项', typical: '对账/付款' },
  { id: 'wangwu', label: '员工', username: 'wangwu', password: 'Emp@123', permissions: '1 项', typical: '我的报销' },
  { id: 'boss', label: '总经理', username: 'boss', password: 'Boss@123', permissions: '3 项', typical: '看板/大额审批' },
]

const tocItems = [
  { id: 'quick-start', label: '快速登录', icon: 'Promotion' },
  { id: 'role-admin', label: '系统管理员', icon: 'UserFilled' },
  { id: 'role-cfo', label: '财务主管', icon: 'Avatar' },
  { id: 'role-zhangsan', label: '会计', icon: 'Wallet' },
  { id: 'role-lisi', label: '出纳', icon: 'Coin' },
  { id: 'role-wangwu', label: '员工', icon: 'OfficeBuilding' },
  { id: 'role-boss', label: '总经理', icon: 'Reading' },
  { id: 'common', label: '通用功能', icon: 'Tools' },
  { id: 'faq', label: 'FAQ', icon: 'QuestionFilled' },
  { id: 'security', label: '数据安全', icon: 'Lock' },
  { id: 'contact', label: '求助', icon: 'Service' },
]

const iconMap: Record<string, any> = {
  Promotion, UserFilled, Avatar, Wallet, Coin, OfficeBuilding, Reading,
  Tools, QuestionFilled, Lock, Service,
}

const filteredToc = computed(() => {
  if (!search.value) return tocItems
  const k = search.value.toLowerCase()
  return tocItems.filter((i) => i.label.toLowerCase().includes(k))
})

const securityItems = [
  { name: '密码加密', value: 'bcrypt 不可逆加密,不能明文查看' },
  { name: '操作留痕', value: '敏感操作全部写入操作日志(改前/改后值)' },
  { name: 'JWT 黑名单', value: '登出立即将 jti 加入黑名单,token 失效' },
  { name: '越权防御', value: '11 处 findFirst tenantId 校验,跨账套访问直接 404' },
  { name: '登录限流', value: '3 次/分钟,5 次/30 分钟,内存计数' },
  { name: '数据备份', value: '一键 pg_dump,自动 + 手工双轨' },
  { name: 'HTTPS', value: '生产环境强制 HTTPS(部署文档说明)' },
  { name: 'SQL 注入', value: 'Prisma 参数化查询,无字符串拼接' },
  { name: '附件限制', value: '白名单 mime(jpg/png/pdf)+ ≤10MB' },
  { name: '不相容岗位', value: '制单人 ≠ 审核人(硬约束,系统强制)' },
]

function scrollTo(id: string) {
  activeId.value = id
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function quickLogin(row: typeof loginAccounts[number]) {
  localStorage.setItem('fm_token', '')
  localStorage.setItem('fm_user', JSON.stringify({
    id: 0, username: row.username, realName: row.label,
    isSuper: row.id === 'admin', perms: [], tenants: [], currentTenantId: '1',
  }))
  ElMessage.success(`已填入「${row.label}」账号:${row.username} / ${row.password}。请到登录页输入。`)
  setTimeout(() => router.push('/login'), 800)
}

onMounted(() => {
  // 滚动到当前角色章节
  if (auth.user) {
    const role = Object.values(rolesContent).find((r) => isCurrentRole(r.id))
    if (role) {
      activeId.value = `role-${role.id}`
      setTimeout(() => {
        const el = document.getElementById(`role-${role.id}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    }
  }
})
</script>

<style scoped lang="scss">
.help-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.help-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  align-items: start;
}

.help-toc {
  position: sticky;
  top: 80px;
  background: var(--fm-bg-card, #fff);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}

.search-input {
  margin-bottom: 12px;
}

.toc-menu {
  border: none;
}

.toc-menu :deep(.el-menu-item) {
  border-radius: 8px;
  margin: 2px 0;
}

.help-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.cred {
  background: var(--fm-bg-muted, #f5f7fa);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 12px;
}

.rich-text :deep(h4) {
  margin: 16px 0 8px;
  color: var(--fm-text-primary, #1e293b);
  font-weight: 600;
}

.rich-text :deep(p) {
  line-height: 1.7;
  margin: 8px 0;
}

.rich-text :deep(ol), .rich-text :deep(ul) {
  padding-left: 24px;
  line-height: 1.8;
}

.rich-text :deep(code) {
  background: var(--fm-bg-muted, #f5f7fa);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--fm-brand-600, #4f46e5);
}

.rich-text :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 12px 0;
}

.rich-text :deep(strong) {
  color: var(--fm-brand-600, #4f46e5);
  font-weight: 600;
}

.rich-text :deep(em) {
  color: var(--fm-warning, #f59e0b);
  font-style: normal;
  font-weight: 600;
}

.rich-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}

.rich-text :deep(table th) {
  background: var(--fm-bg-muted, #f5f7fa);
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  border: 1px solid var(--fm-border, #e2e8f0);
}

.rich-text :deep(table td) {
  padding: 8px 12px;
  border: 1px solid var(--fm-border, #e2e8f0);
}

.version {
  text-align: center;
  color: var(--fm-text-muted, #94a3b8);
  font-size: 12px;
  margin: 24px 0 8px;
}

@media (max-width: 900px) {
  .help-layout {
    grid-template-columns: 1fr;
  }
  .help-toc {
    position: static;
    max-height: none;
  }
}
</style>
