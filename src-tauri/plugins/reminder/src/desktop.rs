use tauri::Runtime;

pub struct ReminderPlugin<R: Runtime> {
    _runtime: std::marker::PhantomData<R>,
}
