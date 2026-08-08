import { Link } from 'react-router-dom';

const EFFECTIVE_DATE = 'August 8, 2025';

export default function Privacy() {
  return (
    <PublicShell title="Privacy Policy">
      <p className="text-sm text-slate-500 mb-8">Effective date: {EFFECTIVE_DATE}</p>

      <Section heading="About TeamNotifi">
        <p>
          TeamNotifi is an employee communication and attendance service operated
          by PH Companies LLC. It is used by current employees to receive and
          submit employment-related communications, including work schedules,
          attendance information, absence and late-arrival reporting, call-outs,
          shift coverage notices, operational updates, and other employment-related
          notifications.
        </p>
      </Section>

      <Section heading="Information We Collect">
        <p>TeamNotifi may collect information necessary to provide the service, including:</p>
        <ul>
          <li>Employee name and mobile phone number</li>
          <li>Employer, location, and workplace information</li>
          <li>Schedule information where applicable</li>
          <li>Attendance information, absence and late-arrival submissions, call-out and shift-coverage information</li>
          <li>Messages or other information submitted through TeamNotifi</li>
          <li>SMS consent, opt-in, and opt-out records</li>
          <li>Basic technical and log information necessary to operate and secure the service</li>
        </ul>
      </Section>

      <Section heading="How We Use Information">
        <p>Information collected through TeamNotifi is used to:</p>
        <ul>
          <li>Operate TeamNotifi and process employee workplace communications</li>
          <li>Send transactional and employment-related SMS messages and confirmations</li>
          <li>Communicate schedule, attendance, call-out, shift coverage, and operational information</li>
          <li>Maintain records of SMS consent and preferences</li>
          <li>Support, secure, troubleshoot, and improve the service</li>
          <li>Comply with applicable legal obligations</li>
        </ul>
      </Section>

      <Section heading="SMS and Mobile Communications">
        <p className="font-medium text-slate-900">
          Mobile information, including phone numbers, SMS opt-in data, and
          consent, will not be shared with third parties or affiliates for
          marketing or promotional purposes. Information may be shared with
          service providers solely as necessary to provide the TeamNotifi
          service and deliver SMS communications.
        </p>
        <p className="mt-3">
          TeamNotifi sends transactional and employment-related SMS messages.
          SMS consent information is not used for third-party marketing.
          These are not marketing messages.
        </p>
      </Section>

      <Section heading="Sharing of Information">
        <p>
          PH Companies LLC does not sell personal information. Information may
          be shared with service providers only as necessary to operate
          TeamNotifi, including providers of hosting, communications
          infrastructure, and SMS delivery.
        </p>
      </Section>

      <Section heading="Data Retention and Security">
        <p>
          TeamNotifi retains information for as long as necessary to provide
          the service and meet applicable legal and business requirements.
          We implement reasonable technical and organizational measures to
          protect information against unauthorized access, disclosure, or loss.
          No system is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For privacy-related questions or requests, contact PH Companies LLC:
        </p>
        <p className="mt-2">
          <strong>Phone:</strong> 404-885-8788<br />
          <strong>Address:</strong> 230 Windsor Pkwy NE, Sandy Springs, GA 30342
        </p>
      </Section>
    </PublicShell>
  );
}

function Section({ heading, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{heading}</h2>
      <div className="text-slate-600 space-y-2 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

function PublicShell({ title, children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-forest text-white">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center gap-3">
          <img src="/logo.png" alt="TeamNotifi" className="h-8 w-8 object-contain" />
          <img src="/text.png" alt="TeamNotifi" className="h-6 object-contain" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">{title}</h1>
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-5 py-6 flex flex-wrap gap-4 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} PH Companies LLC</span>
          <Link to="/privacy" className="hover:text-slate-700 underline">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-slate-700 underline">Terms &amp; Conditions</Link>
        </div>
      </footer>
    </div>
  );
}
