<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
// Element Plus 改为按需引入后,中文语言包通过 ConfigProvider 全局生效
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>
