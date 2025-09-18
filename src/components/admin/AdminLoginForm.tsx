"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

interface AdminLoginFormProps {
  luosimaoSiteKey?: string;
}

export default function AdminLoginForm(props: AdminLoginFormProps) {
  const { luosimaoSiteKey } = props;
  const router = useRouter();
  const emailId = useId();
  const codeId = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaResponse, setCaptchaResponse] = useState("");

  // 检查是否配置了 Luosimao 验证码
  const isLuosimaoConfigured = !!luosimaoSiteKey;
  const isDevelopment = process.env.NODE_ENV === "development";

  // 加载 Luosimao 验证码脚本
  useEffect(() => {
    if (isLuosimaoConfigured && !isDevelopment) {
      const scriptId = "luosimao-captcha-script";
      if (document.getElementById(scriptId)) {
        return;
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "//captcha.luosimao.com/static/dist/api.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);

      // 设置全局回调函数
      (
        window as typeof window & { handleCaptchaSuccess?: (response: string) => void }
      ).handleCaptchaSuccess = (response: string) => {
        setCaptchaResponse(response);
      };

      return () => {
        const scriptElement = document.getElementById(scriptId);
        if (scriptElement) {
          document.body.removeChild(scriptElement);
        }
        delete (window as typeof window & { handleCaptchaSuccess?: (response: string) => void })
          .handleCaptchaSuccess;
      };
    }
  }, [isLuosimaoConfigured, isDevelopment]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 在开发环境中使用绕过验证码
      const captchaValue = isDevelopment ? "development-bypass" : captchaResponse;

      if (!captchaValue) {
        setError("请完成人机验证");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/trpc/auth.sendAdminCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          captchaResponse: captchaValue,
        }),
      });

      const result = await response.json();

      if (result.result?.data?.success) {
        setStep("code");
      } else {
        setError(result.error?.message || "发送验证码失败");
      }
    } catch (error) {
      console.error("Failed to send admin code:", error);
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/trpc/auth.verifyCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          code,
        }),
      });

      const result = await response.json();

      if (result.result?.data?.success) {
        // 登录成功，重定向到管理后台
        router.push("/admin/dashboard");
        router.refresh();
      } else {
        setError(result.error?.message || "验证码错误");
      }
    } catch (error) {
      console.error("Failed to verify admin code:", error);
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = () => {
    setStep("email");
    setCode("");
    setError("");
  };

  const handleBackToEmail = () => {
    setStep("email");
    setCode("");
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-sm w-full space-y-8">
        {/* Logo和标题 */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 text-primary text-6xl">🛡️</div>
          <h2 className="mt-6 text-3xl font-bold text-base-content">管理员登录</h2>
          <p className="mt-2 text-sm text-base-content/70">请输入邮箱并完成人机验证以接收验证码</p>
        </div>

        {/* 登录表单 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            {step === "email" ? (
              /* 邮箱输入阶段 */
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label htmlFor={emailId} className="label pb-1">
                    <span className="label-text font-medium">邮箱地址</span>
                  </label>
                  <input
                    id={emailId}
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="请输入邮箱地址"
                  />
                </div>

                {/* 人机验证 */}
                <div>
                  <label className="label pb-1" htmlFor="captcha">
                    <span className="label-text font-medium">人机验证</span>
                  </label>
                  {isDevelopment ? (
                    <div className="alert alert-info">
                      <span>开发环境：人机验证已自动通过</span>
                    </div>
                  ) : isLuosimaoConfigured ? (
                    <div className="p-4 bg-base-50 rounded-lg border border-base-200">
                      <div
                        className="l-captcha"
                        data-site-key={luosimaoSiteKey}
                        data-callback="handleCaptchaSuccess"
                      ></div>
                    </div>
                  ) : (
                    <div className="alert alert-warning">
                      <span>生产环境需要配置 Luosimao 验证码</span>
                    </div>
                  )}
                </div>

                {error && <div className="text-error text-sm">{error}</div>}

                <div>
                  <button type="submit" disabled={loading} className="btn btn-primary w-full">
                    {loading ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        发送中...
                      </>
                    ) : (
                      "发送验证码"
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* 验证码输入阶段 */
              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <label htmlFor={codeId} className="label pb-1">
                    <span className="label-text font-medium">验证码</span>
                  </label>
                  <input
                    id={codeId}
                    name="code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input input-bordered w-full text-center text-2xl tracking-widest"
                    placeholder="000000"
                  />
                  <div className="label mt-1">
                    <span className="label-text-alt">验证码已发送到您的邮箱</span>
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="label-text-alt link link-primary"
                    >
                      重新发送
                    </button>
                  </div>
                </div>

                {error && <div className="text-error text-sm">{error}</div>}

                <div>
                  <button type="submit" disabled={loading} className="btn btn-primary w-full">
                    {loading ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        验证中...
                      </>
                    ) : (
                      "验证并登录"
                    )}
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleBackToEmail}
                    className="btn btn-ghost w-full"
                  >
                    返回修改邮箱
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
