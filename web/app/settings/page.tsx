"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [telegram, setTelegram] = useState(true);
  const [email, setEmail] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [chatId, setChatId] = useState("");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="border border-border bg-surface rounded-lg p-5 space-y-4">
        <h2 className="font-medium">Notification channels</h2>

        <label className="flex items-center justify-between gap-4">
          <div>
            <div>Telegram</div>
            <div className="text-xs text-gray-500">Inline buttons + snooze</div>
          </div>
          <input
            type="checkbox"
            checked={telegram}
            onChange={(e) => setTelegram(e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        {telegram && (
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="Telegram chat_id (DM @BaseForgeBot /start)"
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm"
          />
        )}

        <label className="flex items-center justify-between gap-4">
          <div>
            <div>Email</div>
            <div className="text-xs text-gray-500">Sent via Resend</div>
          </div>
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        {email && (
          <input
            type="email"
            value={emailAddr}
            onChange={(e) => setEmailAddr(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm"
          />
        )}

        <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">
          Save
        </button>
      </section>

      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">LLM key</h2>
        <p className="text-xs text-gray-500">
          Your key is encrypted (AES-GCM) before it touches the database. Used to parse new-agent prompts.
        </p>
        <input
          type="password"
          placeholder="sk-..."
          className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm font-mono"
        />
        <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">
          Save key
        </button>
      </section>
    </div>
  );
}
