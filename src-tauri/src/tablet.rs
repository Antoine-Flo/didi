//! Native tablet input.
//!
//! WebKitGTK exposes the pen as a mouse with a constant pressure of 0.5 and no tilt.
//! On Linux we listen to the GTK events of the webview widget, which carry the real
//! pen axes, and forward them to the frontend through a channel. Events keep
//! propagating, so WebKit still receives them for the regular UI.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::Channel;

// Only produced by the Linux code: elsewhere, nothing sends pen events (yet).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Down,
    Move,
    Up,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PenEvent {
    pub phase: Phase,
    /// Position in CSS pixels, relative to the webview.
    pub x: f64,
    pub y: f64,
    pub pressure: f64,
    /// Tilt in degrees, like Pointer Events.
    pub tilt_x: f64,
    pub tilt_y: f64,
    /// GTK button number for down/up (1 = tip, 2 and 3 = barrel buttons), 0 otherwise.
    pub button: u32,
    /// "pen", "eraser", "mouse", ...
    pub source: &'static str,
    /// Whether the tip (or the left mouse button) is held down, before this event.
    pub pressed: bool,
    /// Event time from the windowing system, in ms.
    pub time: u32,
    /// Wall clock time (ms since epoch) when the event was handled, to measure latency.
    pub sent_at: f64,
}

/// The frontend channel receiving pen events, if one is subscribed.
#[derive(Clone, Default)]
pub struct PenSink(Arc<Mutex<Option<Channel<PenEvent>>>>);

impl PenSink {
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    fn send(&self, event: PenEvent) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(channel) = guard.as_ref()
            && channel.send(event).is_err()
        {
            *guard = None;
        }
    }
}

/// Whether native pen events are available on this platform.
#[tauri::command]
pub fn tablet_available() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub fn tablet_subscribe(sink: tauri::State<'_, PenSink>, channel: Channel<PenEvent>) {
    let mut guard = sink.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(channel);
}

#[cfg(target_os = "linux")]
pub use linux::install;

#[cfg(not(target_os = "linux"))]
pub fn install(_app: &tauri::App) -> tauri::Result<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
mod linux {
    use std::cell::Cell;
    use std::time::{SystemTime, UNIX_EPOCH};

    use gtk::gdk;
    use gtk::glib::Propagation;
    use gtk::prelude::*;
    use tauri::Manager;

    use super::{PenEvent, PenSink, Phase};

    pub fn install(app: &tauri::App) -> tauri::Result<()> {
        let Some(window) = app.get_webview_window("main") else {
            return Ok(());
        };
        let sink = app.state::<PenSink>().inner().clone();
        window.with_webview(move |webview| connect(&webview.inner(), sink))
    }

    fn connect(view: &webkit2gtk::WebView, sink: PenSink) {
        view.add_events(
            gdk::EventMask::POINTER_MOTION_MASK
                | gdk::EventMask::BUTTON_PRESS_MASK
                | gdk::EventMask::BUTTON_RELEASE_MASK,
        );

        // GTK merges motion events to one per frame by default; we want every sample.
        disable_compression(view);
        view.connect_realize(disable_compression);

        // Moves while hovering only matter when the device changes (pen ↔ eraser), and for the
        // first one after a press (a release missed elsewhere): skipping the others keeps the
        // channel from flooding the frontend, which the pointer would lag behind.
        let s = sink.clone();
        let last: Cell<Option<(&'static str, bool)>> = Cell::new(None);
        view.connect_motion_notify_event(move |_, ev| {
            let event = pen_event(Phase::Move, ev, ev.position(), 0);
            let state = (event.source, event.pressed);
            let previous = last.replace(Some(state));
            let needed = event.pressed
                || previous.is_none_or(|(source, pressed)| source != event.source || pressed);
            if needed {
                s.send(event);
            }
            Propagation::Proceed
        });
        let s = sink.clone();
        view.connect_button_press_event(move |_, ev| {
            s.send(pen_event(Phase::Down, ev, ev.position(), ev.button()));
            Propagation::Proceed
        });
        view.connect_button_release_event(move |_, ev| {
            sink.send(pen_event(Phase::Up, ev, ev.position(), ev.button()));
            Propagation::Proceed
        });
    }

    fn disable_compression(view: &webkit2gtk::WebView) {
        if let Some(window) = view.window() {
            window.set_event_compression(false);
        }
        if let Some(window) = view.toplevel().and_then(|t| t.window()) {
            window.set_event_compression(false);
        }
    }

    fn pen_event(phase: Phase, ev: &gdk::Event, (x, y): (f64, f64), button: u32) -> PenEvent {
        let source = match ev.source_device().map(|d| d.source()) {
            Some(gdk::InputSource::Pen) => "pen",
            Some(gdk::InputSource::Eraser) => "eraser",
            Some(gdk::InputSource::Mouse) => "mouse",
            Some(gdk::InputSource::Touchpad) => "touchpad",
            Some(gdk::InputSource::Touchscreen) => "touch",
            _ => "other",
        };
        let axis = |a| ev.axis(a).unwrap_or(0.0);
        PenEvent {
            phase,
            x,
            y,
            pressure: axis(gdk::AxisUse::Pressure),
            // GTK normalizes tilt to [-1, 1] for [-90°, 90°] (checked on Wayland against
            // Chromium's Pointer Events).
            tilt_x: axis(gdk::AxisUse::Xtilt) * 90.0,
            tilt_y: axis(gdk::AxisUse::Ytilt) * 90.0,
            button,
            source,
            pressed: ev
                .state()
                .is_some_and(|s| s.contains(gdk::ModifierType::BUTTON1_MASK)),
            time: ev.time(),
            sent_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0.0, |d| d.as_secs_f64() * 1000.0),
        }
    }
}
