import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Twins Lawn Service",
  description: "How Twins Lawn Service collects, uses, and protects your information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: August 15, 2026</p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          Twins Lawn Service (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This
          policy explains what information we collect from clients and prospective clients, how we use it,
          and the choices you have.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Information We Collect</h2>
        <p>
          We collect information you provide directly to us, such as your name, service address, email
          address, and phone number, when you request an estimate, sign up for service, or otherwise
          communicate with us.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">How We Use Your Information</h2>
        <p>
          We use your information to schedule and provide lawn and landscaping services, send service-related
          communications (appointment reminders, job updates, invoices), and respond to your inquiries.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Text Messaging (SMS)</h2>
        <p>
          If you provide your mobile phone number and opt in to receive text messages from us, we will use
          it to send service-related messages such as appointment reminders, job status updates, and account
          notifications.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>No sharing of mobile information:</strong> We do not share, sell, rent, or otherwise
            disclose mobile phone numbers or opt-in consent data collected for SMS purposes with any third
            party for their own marketing or promotional use. Mobile opt-in data is not shared with any
            third party for any purpose that falls outside the categories below.
          </li>
          <li>
            <strong>Message frequency:</strong> Message frequency varies based on your scheduled services
            and account activity.
          </li>
          <li>
            <strong>Message and data rates may apply.</strong> Carrier message and data rates may apply to
            any text messages we send or you send to us.
          </li>
          <li>
            You may opt out of text messages at any time by replying <strong>STOP</strong>. Reply{" "}
            <strong>HELP</strong> for help. See our{" "}
            <a href="/legal/sms-terms" className="text-brand-600 underline">
              SMS Terms &amp; Conditions
            </a>{" "}
            for full program details.
          </li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Sharing of Information</h2>
        <p>
          We do not sell your personal information. We may share information with service providers who
          perform functions on our behalf (e.g. payment processing, scheduling software), and as required by
          law. Text messaging opt-in consent and mobile phone numbers are never shared with third parties for
          marketing purposes, as noted above.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Your Choices</h2>
        <p>
          You may opt out of text messages at any time (reply STOP), and you may request access to, correction
          of, or deletion of your personal information by contacting us using the information below.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Contact Us</h2>
        <p>
          Questions about this policy? Contact us through your account representative or at the contact
          information provided on your invoice or service agreement.
        </p>
      </section>
    </main>
  );
}
