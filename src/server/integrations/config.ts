/** Server-only configuration. Never return this object from a page/layout loader. */
export function getProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim() || undefined;
  const from = env.RESEND_FROM?.trim() || undefined;
  const secretKey = env.STRIPE_SECRET_KEY?.trim() || undefined;
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
  const stripeTestMode = Boolean(secretKey?.startsWith('sk_test_'));
  return {
    email: { apiKey, from, available: Boolean(apiKey && from) },
    payment: {
      secretKey, publishableKey, webhookSecret,
      checkoutAvailable: stripeTestMode,
      webhookAvailable: stripeTestMode && Boolean(webhookSecret?.startsWith('whsec_')),
      reason: !secretKey ? 'Stripe test Checkout is unconfigured'
        : !stripeTestMode ? 'Only Stripe test-mode secret keys are supported' : null,
    },
    map: {
      // Style URL is public; tile attribution and any provider token belong in the style/provider setup.
      styleUrl: env.LITHONO_MAP_STYLE_URL?.trim() || undefined,
      attribution: env.LITHONO_MAP_ATTRIBUTION?.trim() || undefined,
    },
    editorEmails: (env.LITHONO_EDITOR_EMAILS ?? '').split(',')
      .map(email => email.trim().toLowerCase()).filter(Boolean),
    editorUserIds: (env.LITHONO_EDITOR_USER_IDS ?? '').split(',')
      .map(id => id.trim()).filter(Boolean),
  };
}

export type ProviderConfig = ReturnType<typeof getProviderConfig>;
import '../environment.ts';
