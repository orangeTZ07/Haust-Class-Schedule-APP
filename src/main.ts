import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import Vant from "vant";
import "vant/lib/index.css";
import "./styles/global.css";

const app = createApp(App);
app.use(router);
app.use(Vant);
app.mount("#app");
