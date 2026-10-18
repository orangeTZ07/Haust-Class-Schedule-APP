import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import Vant, { setDialogDefaultOptions } from "vant";
import { installKeyboardInset } from "./composables/useKeyboardInset";
import "vant/lib/index.css";
import "./styles/global.css";

// Every Vant dialog gets the app's card styling (see .theme-confirm-dialog in global.css), including
// ones opened by code that does not know about it.
setDialogDefaultOptions({
  className: "theme-confirm-dialog",
  confirmButtonText: "确定",
  cancelButtonText: "取消",
});

// 键盘挡住的高度写进 --kb-inset：底部面板（导入课表 / 节次时间 / 网格设置）靠它整体上移。
// 少了这一步，键盘会把面板下半截连同末尾的按钮一起盖住，而面板内部也再没有余量把它滑出来。
installKeyboardInset();

const app = createApp(App);
app.use(router);
app.use(Vant);
app.mount("#app");
