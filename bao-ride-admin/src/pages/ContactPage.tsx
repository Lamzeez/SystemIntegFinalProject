import React from "react";

export default function ContactPage() {
  return (
    <div className="page">
      <section className="panel">
        <h2 className="panel-title">Get in touch</h2>

        <div className="contact-grid">
          {/* Left: contact details */}
          <div className="contact-list">
            <div>
              <div className="contact-label">Phone</div>
              <div>+63 912 345 6789</div>
              <div>+63 923 456 7890</div>
            </div>

            <div>
              <div className="contact-label">Email</div>
              <div>support@baoride.com</div>
              <div>admin@baoride.com</div>
            </div>

            <div>
              <div className="contact-label">Office Address</div>
              <div>123 Main Street, Mati City</div>
              <div>Davao Oriental, Philippines</div>
            </div>
          </div>

          {/* Right: socials */}
          <div>
            <div className="social-card">
              <strong>Facebook</strong>
              <div>@BaoRideMatiCity</div>
            </div>
            <div className="social-card">
              <strong>Instagram</strong>
              <div>@BaoRideMatiCity</div>
            </div>
            <div className="social-card">
              <strong>X (Twitter)</strong>
              <div>@BaoRideMatiCity</div>
            </div>
            <div className="social-card">
              <strong>Messenger</strong>
              <div>@BaoRideMatiCity</div>
            </div>
          </div>
        </div>
      </section>

      <section className="business-hours">
        <h3 className="panel-title" style={{ marginBottom: 10 }}>
          Business Hours
        </h3>
        <div className="business-hours-grid">
          <div>
            <div className="hours-label">Monday – Friday</div>
            <div>8:00 AM – 6:00 PM</div>
          </div>
          <div>
            <div className="hours-label">Saturday</div>
            <div>9:00 AM – 5:00 PM</div>
          </div>
          <div>
            <div className="hours-label">Sunday</div>
            <div>8:00 AM – 6:00 PM</div>
          </div>
          <div>
            <div className="hours-label">Emergency Support</div>
            <div>24/7 Available</div>
          </div>
        </div>
      </section>
    </div>
  );
}
