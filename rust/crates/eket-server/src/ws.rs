// WebSocket endpoint: /ws
// Streams WorkflowEvent JSON to connected clients.
// TASK-234

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use tokio::sync::broadcast;
use tracing::{debug, warn};

use eket_engine::ticket_engine::WorkflowEvent;

use crate::AppState;

/// Upgrade HTTP request to WebSocket and hand off to `handle_socket`.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rx = state.event_tx.subscribe();
    ws.on_upgrade(move |socket| handle_socket(socket, rx))
}

async fn handle_socket(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<WorkflowEvent>,
) {
    loop {
        tokio::select! {
            recv_result = rx.recv() => {
                match recv_result {
                    Ok(event) => {
                        let msg = serde_json::to_string(&event).unwrap_or_default();
                        if socket.send(Message::Text(msg)).await.is_err() {
                            debug!("ws client disconnected (send error)");
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!("ws receiver lagged by {n} messages");
                        // continue — don't disconnect on lag
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        debug!("ws broadcast channel closed");
                        break;
                    }
                }
            }
            client_msg = socket.recv() => {
                match client_msg {
                    Some(Ok(Message::Close(_))) | None => {
                        debug!("ws client closed connection");
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        // axum auto-replies pong, but handle explicitly for clarity
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Some(Ok(_)) => {} // ignore text/binary from client
                    Some(Err(e)) => {
                        warn!("ws receive error: {e}");
                        break;
                    }
                }
            }
        }
    }
}
