import { Link } from 'react-router-dom';

const EFFECTIVE_DATE = 'August 8, 2025';

export default function Terms() {
  return (
    <PublicShell title="Terms & Conditions">
      <p className="text-sm text-slate-500 mb-8">Effective date: {EFFECTIVE_DATE}</p>

      <Section heading="About TeamNotifi">
        <p>
          TeamNotifi is operated by PH Companies LLC. It is an employee
          attendance and workplace communication service that allows current
          employees to report absences and late arrivals and to receive
          automated attendance-related communications.
        </p>
      </Section>

      <Section heading="Employer Policies">
        <p>
          Use of TeamNotifi is subject to the policies of your employer,
          including applicable attendance policies. TeamNotifi facilitates
          the submission and routing of attendance-related communications.
          It does not itself determine whether an absence is excused, whether
          documentation is required, or what employment action may result.
          Those decisions are made by your employer or management under
          applicable workplace policies.
        </p>
      </Section>

      <Section heading="Acceptable Use">
        <p>
          TeamNotifi is intended solely for legitimate attendance reporting
          and related employment communications. Users may not submit false
          or misleading information, attempt to circumvent or disrupt the
          service, or use TeamNotifi for any purpose unrelated to its
          intended function.
        </p>
      </Section>

      <Section heading="Service Availability">
        <p>
          TeamNotifi is provided as-is. PH Companies LLC does not guarantee
          uninterrupted availability and is not liable for delays, errors,
          or failures in transmission or delivery. If you are unable to
          successfully submit a report through TeamNotifi, contact your
          manager directly to ensure your absence or late arrival is
          properly recorded.
        </p>
      </Section>

      <Section heading="SMS Terms — TeamNotifi Employee Communications">
        <p>
          <strong>Program:</strong> TeamNotifi Employee Communications
        </p>
        <p className="mt-2">
          TeamNotifi sends transactional SMS messages to current employees
          regarding attendance reporting, absence and late-arrival submissions,
          confirmations, and related employment communications. These are not
          marketing messages.
        </p>
        <ul className="mt-3">
          <li>Message frequency varies based on your submissions and employer activity.</li>
          <li>Message and data rates may apply.</li>
          <li>Reply <strong>STOP</strong> to opt out of SMS messages from TeamNotifi.</li>
          <li>Reply <strong>HELP</strong> for help.</li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
        <p className="mt-3">
          For support, contact PH Companies LLC at <strong>404-885-8788</strong>.
        </p>
        <p className="mt-3">
          See our <Link to="/privacy" className="text-forest underline hover:text-forest-light">Privacy Policy</Link> for
          information on how we handle mobile and personal information.
        </p>
      </Section>

      <Section heading="Governing Law">
        <p>
          These Terms are governed by the laws of the State of Georgia,
          United States, without regard to conflict of law principles.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For questions about these Terms, contact PH Companies LLC:
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
