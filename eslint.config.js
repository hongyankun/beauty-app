// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `.expo/` 是 expo-router 与 expo 生成的产物目录（已在 .gitignore 中），
    // 其中 types/router.d.ts 固定带一行 /* eslint-disable */，会被报成
    // "unused eslint-disable directive"。只忽略这一个生成目录，源码照常检查。
    ignores: ["dist/*", ".expo/**"],
  }
]);
