import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import Vant, { setDialogDefaultOptions } from "vant";
import "vant/lib/index.css";
import "./styles/global.css";

// Every Vant dialog gets the app's card styling (see .theme-confirm-dialog in global.css), including
// ones opened by code that does not know about it.
setDialogDefaultOptions({
  className: "theme-confirm-dialog",
  confirmButtonText: "确定",
  cancelButtonText: "取消",
});

const app = createApp(App);
app.use(router);
app.use(Vant);
app.mount("#app");
