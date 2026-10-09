//! Há quanto tempo o usuário não mexe no teclado nem no mouse.
//! `None` quando o sistema não informa (por exemplo, Linux com Wayland).

#[cfg(windows)]
pub fn segundos_ocioso() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` é um LASTINPUTINFO válido com cbSize preenchido.
    if unsafe { GetLastInputInfo(&mut info) } == 0 {
        return None;
    }
    // SAFETY: sem pré-condições.
    let agora = unsafe { GetTickCount() };
    Some(u64::from(agora.wrapping_sub(info.dwTime)) / 1000)
}

#[cfg(target_os = "macos")]
pub fn segundos_ocioso() -> Option<u64> {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(estado: i32, tipo: u32) -> f64;
    }
    const SESSAO_COMBINADA: i32 = 0; // kCGEventSourceStateCombinedSessionState
    const QUALQUER_EVENTO: u32 = !0; // kCGAnyInputEventType
    // SAFETY: função pura do CoreGraphics, sem ponteiros.
    let segundos = unsafe { CGEventSourceSecondsSinceLastEventType(SESSAO_COMBINADA, QUALQUER_EVENTO) };
    segundos.is_finite().then(|| segundos.max(0.0) as u64)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn segundos_ocioso() -> Option<u64> {
    use x11rb::connection::Connection;
    use x11rb::protocol::screensaver::ConnectionExt;

    let (conexao, tela) = x11rb::connect(None).ok()?;
    let raiz = conexao.setup().roots.get(tela)?.root;
    let info = conexao.screensaver_query_info(raiz).ok()?.reply().ok()?;
    Some(u64::from(info.ms_since_user_input) / 1000)
}
