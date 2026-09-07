import { invoke } from "@tauri-apps/api/core";

export async function setReminder(courseScheduleId: number, triggerAt: number) {
  // TODO: 调用 Rust command 设置闹钟
}

export async function cancelReminder(courseScheduleId: number) {
  // TODO: 调用 Rust command 取消闹钟
}

export async function checkBatteryOptimization(): Promise<boolean> {
  // TODO: 检查电池优化状态
  return false;
}

export async function openBatterySettings() {
  // TODO: 跳转电池优化设置页
}
