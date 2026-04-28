"use client";

import { useState } from "react";

export type BotInfo = {
  bot_token: string;
  bot_username: string;
  chat_id: string;
};

interface Props {
  onLinked: (info: BotInfo) => void;
}

/**
 * BYOB (Bring Your Own Bot) Telegram setup.
 *
 * 1. User creates a bot via @BotFather, gets a token like 1234:ABC...
 * 2. User messages their own bot (sends /start)
 * 3. User pastes the token here
 * 4. We call /api/telegram/discover → validates + finds chat_id
 */
export function BotTokenInput({ onLinked }: Props) {
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [info, setInfo] = useState<BotInfo | null>(null);

  async function discover() {
    setError(null);
    setHint(null);
    setVerifying(true);
    try {
      const r = await fetch("/api/telegram/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: token }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(typeof data.error === "string" ? data.error : "Validation failed");
        return;
      }
      if (!data.chat_id) {
        setHint(data.hint ?? "Send /start to your bot, then retry.");
        return;
      }
      const linked: BotInfo = {
        bot_token: token,
        bot_username: data.bot_username,
        chat_id: data.chat_id,
      };
      setInfo(linked);
      onLinked(linked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "discover failed");
    } finally {
      setVerifying(false);
    }
  }

  if (info) {
    return <LinkedView info={info} onReset={() => { setInfo(null); setToken(""); }} />;
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-500 uppercase tracking-wider">Telegram Bot Token</label>
      <div className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <button
          onClick={discover}
          disabled={!token || verifying}
          className="bg-white text-black px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Verify"}
        </button>
      </div>

      <details className="text-[11px] text-gray-500">
        <summary className="cursor-pointer hover:text-gray-300">How to get a bot token →</summary>
        <ol className="mt-2 space-y-1 list-decimal pl-4 text-gray-400">
          <li>Open Telegram, search <span className="font-mono">@BotFather</span></li>
          <li>Send <span className="font-mono">/newbot</span> → follow prompts → get a token like <span className="font-mono">1234:ABC...</span></li>
          <li>Open your new bot, send <span className="font-mono">/start</span> to it</li>
          <li>Paste the token above and click Verify</li>
        </ol>
      </details>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && (
        <div className="text-xs text-amber-400 border border-amber-900 bg-amber-950 rounded p-2">
          {hint}
          <button
            onClick={discover}
            disabled={verifying}
            className="ml-2 underline hover:text-white"
          >
            Re-discover
          </button>
        </div>
      )}
    </div>
  );
}

function LinkedView({ info, onReset }: { info: BotInfo; onReset: () => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: info.chat_id,
          telegram_bot_token: info.bot_token,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setTestResult("fail");
        setTestError(data.error ?? "send failed");
      } else {
        setTestResult("ok");
      }
    } catch (e) {
      setTestResult("fail");
      setTestError(e instanceof Error ? e.message : "network error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="border border-emerald-700 bg-emerald-950 rounded-md p-3 text-sm space-y-2">
      <div className="text-emerald-300 font-medium">
        ✓ Linked @{info.bot_username}
      </div>
      <div className="text-xs text-gray-400">
        Chat ID <span className="font-mono">{info.chat_id}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={sendTest}
          disabled={testing}
          className="text-xs bg-white text-black px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
        >
          {testing ? "Sending…" : "📨 Send test alert"}
        </button>
        {testResult === "ok" && (
          <span className="text-xs text-emerald-400">✓ Check your Telegram!</span>
        )}
        {testResult === "fail" && (
          <span className="text-xs text-red-400 truncate">✗ {testError}</span>
        )}
      </div>
      <button
        onClick={onReset}
        className="text-[11px] text-gray-500 hover:text-white underline"
      >
        Use a different bot
      </button>
    </div>
  );
}
