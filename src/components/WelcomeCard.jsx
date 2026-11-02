// v1.10.81 - a welcome for new users at the top of the Dashboard (asked for by
// the maintainer): thanks them, and whoever told them about the app, says it
// is free for good, and that support of any amount is welcome but never
// needed. On the page, not a popup; shown until closed and only while the
// business has fewer than 10 invoices (from 10 the daily support card takes
// over, so the two never show together).
import { useState } from 'react';
import { Heart, Share2, X } from 'lucide-react';
import { SUPPORT_NUDGE_MIN_INVOICES } from '../utils/supporters';
import HelpButton from './HelpButton';

const KEY = 'freegstbill_welcomeCard';
const SHARE_TEXT = 'I use E-Munim for my GST invoices. It works offline and keeps data on your own PC: https://github.com/aman1455/E-munim';

const isClosed = () => { try { return localStorage.getItem(KEY) === 'closed'; } catch { return false; } };

export default function WelcomeCard({ invoiceCount }) {
  const [closed, setClosed] = useState(isClosed);
  if (closed || invoiceCount >= SUPPORT_NUDGE_MIN_INVOICES) return null;
  const close = () => {
    try { localStorage.setItem(KEY, 'closed'); } catch { /* private mode */ }
    setClosed(true);
  };
  return (
    <section className="welcome-card" aria-labelledby="welcome-card-title">
      <button type="button" className="welcome-card-close" onClick={close} aria-label="Close the welcome note">
        <X size={18} />
      </button>
      <h2 id="welcome-card-title">Welcome to E-Munim <HelpButton title="The welcome note" doc="dashboard#welcome-card" size={16} /></h2>
      <p className="welcome-card-lead">
        Thank you for choosing E-Munim. A modern, reliable GST billing &amp; accounting solution built for your business.

      </p>
      <ul className="welcome-card-points">
        <li><strong>Fast &amp; Professional.</strong> Create GST tax invoices, delivery challans, and bills of supply in seconds.</li>
        <li><strong>Your data stays yours.</strong> Everything is saved on this PC and works offline.</li>
        <li><strong>Filing &amp; Compliance Ready.</strong> Automatic CGST, SGST, IGST calculations with GSTR-1, GSTR-3B &amp; TDS/TCS exports.</li>
        <li><strong>Reliable &amp; Modern.</strong> Inventory management, multi-currency invoicing, thermal printing, and quick search.</li>
      </ul>
      <div className="welcome-card-actions">
        <button type="button" className="welcome-card-btn welcome-card-btn-primary" onClick={close}>
          Start Billing Now
        </button>
        <a className="welcome-card-btn" href={`https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`} target="_blank" rel="noopener noreferrer">
          <Share2 size={16} /> Share on WhatsApp
        </a>

      </div>
    </section>
  );
}
