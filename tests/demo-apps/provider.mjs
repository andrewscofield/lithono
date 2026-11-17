// Test-process-only transport substitute. No application switch or credentials.
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input) === 'https://api.stripe.com/v1/checkout/sessions') {
    const body = new URLSearchParams(options.body);
    if (body.get('customer_email') === 'workshop-checkout-fail@example.test') return new Response('', { status: 503 });
    const id = body.get('metadata[bookingId]');
    return Response.json({ id: `cs_test_${id}`, url: `https://checkout.stripe.com/c/pay/${id}`, livemode: false });
  }
  if (String(input) === 'https://api.resend.com/emails') {
    const message = JSON.parse(options.body);
    return ['native-property@example.test', 'workshop-native@example.test', 'community-newsletter@example.test'].includes(message.to)
      ? Response.json({ id: 'deterministic-provider-acceptance' })
      : new Response('deterministic provider failure', { status: 503 });
  }
  return original(input, options);
};
