import { z } from 'zod';
import { config } from './config';

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
    const { secretKey } = config.captcha;

    const formData = new URLSearchParams();
    formData.append('api_key', secretKey);
    formData.append('response', response);

    const apiResponse = await fetch('https://captcha.luosimao.com/api/site_verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
      console.error('Failed to parse Luosimao API response:', validation.error);
      return false;
    }

    return validation.data.res === 'success';
  } catch (error) {
    // 如果配置验证失败或网络请求失败
    if (error instanceof Error && error.message.includes('Environment variable validation failed')) {
      console.error('LUOSIMAO_SECRET_KEY configuration error:', error.message);
      // 在开发环境下，配置错误时返回 true 以便测试
      try {
        const { isDevelopment } = config.env;
        return isDevelopment;
      } catch {
        // 如果连环境配置都读取不了，假设是开发环境
        return process.env.NODE_ENV === 'development';
      }
    }

    console.error('An error occurred during captcha verification:', error);
    return false;
  }
}
