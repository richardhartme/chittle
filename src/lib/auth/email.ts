import { Resend } from "resend";
import { env } from "@/lib/env";

export async function sendMagicLinkEmail(to: string, link: string): Promise<void> {
  const apiKey = env.resendApiKey;

  if (!apiKey) {
    if (env.isProduction) throw new Error("RESEND_API_KEY must be set in production");
    console.log(`\n  Magic link for ${to}:\n  ${link}\n`);
    return;
  }

  const { error } = await new Resend(apiKey).emails.send({
    from: env.emailFrom,
    to,
    subject: "Your Chittle sign-in link",
    text: `Sign in to Chittle:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, you can ignore this email.`,
  });
  if (error) throw new Error(`Failed to send magic link: ${error.message}`);
}
