import { z } from "zod";

const luosimaoResponseSchema = z.object({
  res: z.string(),
  error: z.union([z.string(), z.number()]),
});

/**
 * Verifies the user's captcha response with Luosimao API.
 * @param response The 'luotest_response' value from the frontend widget.
 * @returns True if the verification is successful, false otherwise.
 */
export async function verifyCaptcha(response: string): Promise<boolean> {
  try {
    // 在开发环境下，允许使用特殊的测试响应绕过验证
    if (process.env.NODE_ENV === "development" && response === "development-bypass") {
      console.log("Development mode: bypassing captcha verification");
      return true;
    }

    const secretKey = process.env.LUOSIMAO_SECRET_KEY;

    if (!secretKey) {
      console.error("LUOSIMAO_SECRET_KEY not configured");
      // 在开发环境下，配置错误时返回 true 以便测试
      return process.env.NODE_ENV === "development";
    }

    const formData = new URLSearchParams();
    formData.append("api_key", secretKey);
    formData.append("response", response);

    const apiResponse = await fetch("https://captcha.luosimao.com/api/site_verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!apiResponse.ok) {
      console.error(`Luosimao API request failed with status: ${apiResponse.status}`);
      return false;
    }

    const result = await apiResponse.json();
    const validation = luosimaoResponseSchema.safeParse(result);

    if (!validation.success) {
      console.error("Failed to parse Luosimao API response:", validation.error);
      return false;
    }

    return validation.data.res === "success";
  } catch (error) {
    console.error("An error occurred during captcha verification:", error);
    // 在开发环境下，网络错误时返回 true 以便测试
    return process.env.NODE_ENV === "development";
  }
}
