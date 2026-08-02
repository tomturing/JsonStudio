// Window-related commands

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "macos")]
use dispatch2::DispatchQueue;

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
static MACOS_THEME_GENERATION: AtomicU64 = AtomicU64::new(0);

fn transparent_window_background() -> tauri::window::Color {
    tauri::window::Color(0, 0, 0, 0)
}

/// Set the native window theme while leaving custom chrome transparency intact.
#[tauri::command]
pub fn set_window_theme(window: tauri::WebviewWindow, is_dark: bool) -> Result<(), String> {
    let theme = if is_dark {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    };
    window.set_theme(Some(theme)).map_err(|e| e.to_string())?;
    window
        .set_background_color(Some(transparent_window_background()))
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    apply_macos_window_theme(&window, is_dark)?;

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn apply_macos_native_titlebar(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(ns_window) = window.ns_window() {
            apply_macos_transparent_chrome(ns_window);
            unsafe {
                layout_macos_titlebar(ns_window as cocoa::base::id);
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn apply_macos_window_theme(
    window: &tauri::WebviewWindow,
    is_dark: bool,
) -> Result<(), String> {
    let generation = MACOS_THEME_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    let app_handle = window.app_handle().clone();
    let window_label = window.label().to_owned();

    window
        .run_on_main_thread(move || {
            if MACOS_THEME_GENERATION.load(Ordering::Acquire) != generation {
                return;
            }

            let Some(window) = app_handle.get_webview_window(&window_label) else {
                return;
            };
            let Ok(ns_window) = window.ns_window() else {
                return;
            };

            unsafe {
                use cocoa::base::{id, nil};
                use cocoa::foundation::NSString;
                use objc::{msg_send, sel, sel_impl};

                let ns_window = ns_window as id;
                let appearance_name = if is_dark {
                    NSString::alloc(nil).init_str("NSAppearanceNameDarkAqua")
                } else {
                    NSString::alloc(nil).init_str("NSAppearanceNameAqua")
                };
                let appearance_class = objc::class!(NSAppearance);
                let appearance: id = msg_send![appearance_class, appearanceNamed: appearance_name];
                let _: () = msg_send![ns_window, setAppearance: appearance];
                apply_macos_transparent_chrome(ns_window as *mut std::ffi::c_void);
                layout_macos_titlebar(ns_window);
            }

            let follow_up_app = app_handle.clone();
            let follow_up_label = window_label.clone();
            DispatchQueue::main().exec_async(move || {
                if MACOS_THEME_GENERATION.load(Ordering::Acquire) != generation {
                    return;
                }

                let Some(window) = follow_up_app.get_webview_window(&follow_up_label) else {
                    return;
                };
                let Ok(ns_window) = window.ns_window() else {
                    return;
                };

                unsafe {
                    layout_macos_titlebar(ns_window as cocoa::base::id);
                }
            });
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn apply_macos_transparent_chrome(ns_window: *mut std::ffi::c_void) {
    use cocoa::appkit::{
        NSColor, NSWindow, NSWindowButton, NSWindowCollectionBehavior, NSWindowStyleMask,
        NSWindowTitleVisibility,
    };
    use cocoa::base::{id, nil, NO, YES};
    use objc::{msg_send, sel, sel_impl};

    let ns_window = ns_window as id;

    unsafe {
        let background = NSColor::clearColor(nil);
        let current_style_mask = ns_window.styleMask();
        let mut style_mask = current_style_mask;
        style_mask |= NSWindowStyleMask::NSTitledWindowMask;
        style_mask |= NSWindowStyleMask::NSClosableWindowMask;
        style_mask |= NSWindowStyleMask::NSMiniaturizableWindowMask;
        style_mask |= NSWindowStyleMask::NSResizableWindowMask;
        style_mask |= NSWindowStyleMask::NSFullSizeContentViewWindowMask;
        if style_mask != current_style_mask {
            ns_window.setStyleMask_(style_mask);
        }
        ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
        ns_window.setTitlebarAppearsTransparent_(YES);
        ns_window.setOpaque_(NO);
        ns_window.setBackgroundColor_(background);
        let _: () = msg_send![ns_window, setHasShadow: NO];

        for button_kind in [
            NSWindowButton::NSWindowCloseButton,
            NSWindowButton::NSWindowMiniaturizeButton,
            NSWindowButton::NSWindowZoomButton,
        ] {
            let button = ns_window.standardWindowButton_(button_kind);
            if button != nil {
                let _: () = msg_send![button, setHidden: NO];
            }
        }

        let mut behavior = ns_window.collectionBehavior();
        behavior |= NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenPrimary;
        behavior |= NSWindowCollectionBehavior::NSWindowCollectionBehaviorManaged;
        behavior |= NSWindowCollectionBehavior::NSWindowCollectionBehaviorParticipatesInCycle;
        behavior &= !NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
        ns_window.setCollectionBehavior_(behavior);
    }
}

#[cfg(target_os = "macos")]
unsafe fn layout_macos_titlebar(ns_window: cocoa::base::id) {
    use cocoa::base::nil;
    use objc::{msg_send, sel, sel_impl};

    let content_view: cocoa::base::id = msg_send![ns_window, contentView];
    if content_view != nil {
        let _: () = msg_send![content_view, layoutSubtreeIfNeeded];
    }
}

/// Return the desktop OS as reported by Rust, for platform-specific custom chrome.
#[tauri::command]
pub fn desktop_platform() -> &'static str {
    std::env::consts::OS
}

/// Quit the application
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Restart the application after an update has been installed.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Open developer tools
#[tauri::command]
pub fn open_devtools(_window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    {
        let _ = _window.open_devtools();
    }
}
