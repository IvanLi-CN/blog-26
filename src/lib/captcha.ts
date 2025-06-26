import { z } from 'zod';

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
  if (!import.meta.env.LUOSIMAO_SECRET_KEY) {
    console.error('LUOSIMAO_SECRET_KEY is not set in environment variables.');
    // In dev environment, we might want to bypass this for easier testing
    return import.meta.env.DEV;
  }

  const formData = new URLSearchParams();
  formData.append('api_key', import.meta.env.LUOSIMAO_SECRET_KEY);
  formData.append('response', response);

  try {
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
    console.error('An error occurred during captcha verification:', error);
    return false;
  }
}
