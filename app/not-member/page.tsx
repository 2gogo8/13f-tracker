"use client";

import { signOut } from "next-auth/react";

export default function NotMemberPage() {
  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="apple-card p-8 text-center">
          <h1 className="font-serif text-2xl font-bold mb-1">
            <span className="text-accent">JG</span>
            <span className="text-gray-900">的</span>
            <span className="text-primary font-black">反</span>
            <span className="text-gray-900">市場報告書</span>
          </h1>

          <div className="my-6 p-4 bg-red-50 rounded-xl border border-red-100">
            <p className="text-sm text-red-800 font-medium mb-1">
              ⚠️ 尚未偵測到會員資格
            </p>
            <p className="text-xs text-red-600">
              此網站僅限 JG YouTube 頻道付費會員使用
            </p>
          </div>

          <div className="space-y-3 text-left text-xs text-gray-500 mb-6">
            <p>可能的原因：</p>
            <ul className="list-disc list-inside space-y-1">
              <li>您尚未訂閱 JG 頻道會員</li>
              <li>您使用的 Google 帳號與訂閱會員的帳號不同</li>
              <li>會員資料同步有延遲（最多 1 小時）</li>
            </ul>
          </div>

          <div className="space-y-3">
            <a
              href="https://www.youtube.com/@JGTrueStock/join"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors text-center"
            >
              加入 JG 頻道會員
            </a>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              換一個帳號登入
            </button>
          </div>

          <p className="text-[10px] text-gray-300 mt-6">
            如有問題請聯繫 JG
          </p>
        </div>
      </div>
    </div>
  );
}
