<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showConfirmDialog, showToast } from "vant";
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from "@lucide/vue";
import { useCourses } from "@/composables/useCourses";

const router = useRouter();
const {
  courseTables,
  activeCourseTableId,
  activeCourseTable,
  createCourseTable,
  switchCourseTable,
  renameCourseTable,
  deleteCourseTable
} = useCourses();

const newTableName = ref("");
const editingId = ref<number | null>(null);
const editingName = ref("");

const goBack = () => {
  router.back();
};

const handleCreate = async () => {
  const name = newTableName.value.trim();
  if (!name) {
    showToast("名称不能为空");
    return;
  }

  await createCourseTable(name);
  newTableName.value = "";
  showToast("已创建并切换");
};

const handleSwitch = async (id: number) => {
  if (id === activeCourseTableId.value) return;
  await switchCourseTable(id);
  showToast("已切换课程表");
};

const startRename = (id: number, name: string) => {
  editingId.value = id;
  editingName.value = name;
};

const submitRename = async () => {
  if (editingId.value === null) return;
  const name = editingName.value.trim();
  if (!name) {
    showToast("名称不能为空");
    return;
  }

  await renameCourseTable(editingId.value, name);
  editingId.value = null;
  editingName.value = "";
  showToast("已重命名");
};

const handleDelete = async (id: number, name: string) => {
  if (courseTables.value.length <= 1) {
    showToast("至少保留一个课程表");
    return;
  }

  try {
    await showConfirmDialog({
      title: "删除课程表",
      message: `确定删除《${name}》吗？其中的课程和课段都会被移除。`,
      className: "theme-confirm-dialog"
    });
    await deleteCourseTable(id);
    showToast("已删除");
  } catch {
    // 用户取消删除
  }
};
</script>

<template>
  <div class="course-tables-page">
    <div class="header">
      <button class="icon-btn" type="button" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <div class="title-group">
        <span class="title">选择课程表</span>
        <span class="subtitle">{{ activeCourseTable?.name || "默认课程表" }}</span>
      </div>
      <div class="header-spacer"></div>
    </div>

    <div class="content">
      <div class="create-row">
        <van-field
          v-model="newTableName"
          class="name-field"
          placeholder="新课程表名称"
          :border="false"
          @keyup.enter="handleCreate"
        />
        <button class="create-btn" type="button" @click="handleCreate">
          <Plus :size="18" />
        </button>
      </div>

      <div class="table-list">
        <div
          v-for="table in courseTables"
          :key="table.id"
          class="table-item"
          :class="{ active: table.id === activeCourseTableId }"
        >
          <button class="table-main" type="button" @click="handleSwitch(table.id)">
            <span class="table-name">{{ table.name }}</span>
            <span class="table-meta">{{ table.id === activeCourseTableId ? "当前使用" : "点击切换" }}</span>
          </button>

          <div class="table-actions">
            <button
              v-if="editingId !== table.id"
              class="icon-btn compact"
              type="button"
              aria-label="重命名"
              @click="startRename(table.id, table.name)"
            >
              <Pencil :size="15" />
            </button>
            <button
              v-else
              class="icon-btn compact"
              type="button"
              aria-label="保存名称"
              @click="submitRename"
            >
              <Check :size="15" />
            </button>
            <button
              class="icon-btn compact danger"
              type="button"
              aria-label="删除"
              @click="handleDelete(table.id, table.name)"
            >
              <Trash2 :size="15" />
            </button>
          </div>

          <div v-if="editingId === table.id" class="rename-row">
            <van-field
              v-model="editingName"
              class="name-field"
              placeholder="课程表名称"
              :border="false"
              @keyup.enter="submitRename"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.course-tables-page {
  min-height: 100vh;
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  background: color-mix(in srgb, var(--theme-bg-color) 88%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-size: 17px;
  font-weight: 700;
  color: var(--theme-header-text);
}

.subtitle {
  font-size: 12px;
  opacity: 0.62;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-spacer {
  flex: 1;
}

.content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.create-row,
.rename-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-field {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  height: 40px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 34%, transparent);
}

:deep(.van-field) {
  background: transparent;
}

:deep(.van-field__control) {
  color: var(--theme-body-text);
}

.create-btn,
.icon-btn {
  border: none;
  border-radius: 8px;
  color: var(--theme-header-text);
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.create-btn {
  width: 40px;
  height: 40px;
  background: var(--theme-header-bg);
}

.icon-btn {
  width: 34px;
  height: 34px;
}

.icon-btn.compact {
  width: 30px;
  height: 30px;
}

.icon-btn.danger {
  color: #ee0a24;
}

.table-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 36%, transparent);
  background: color-mix(in srgb, var(--theme-body-text) 4%, transparent);
}

.table-item.active {
  border-color: color-mix(in srgb, var(--theme-card-border-color) 72%, transparent);
  background: color-mix(in srgb, var(--theme-card-border-color) 9%, transparent);
}

.table-main {
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--theme-body-text);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--theme-header-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-meta {
  font-size: 12px;
  opacity: 0.62;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rename-row {
  grid-column: 1 / -1;
}
</style>
