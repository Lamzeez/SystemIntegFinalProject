import React from "react";

export default function ServicesPage() {
  return (
    <div className="page">
      <section className="panel">
        <h2 className="panel-title">Our Services</h2>
        <p className="info-panel-text">
          BAO RIDE offers comprehensive transportation services designed to make
          your travel experience in Mati City comfortable, safe, and convenient.
        </p>
        <div className="highlight-badge">
          Serving Mati City Since 2025
        </div>
      </section>

      <section className="services-grid">
        <div className="service-card">
          <div className="service-title">24/7 Availability</div>
          <ul className="service-list">
            <li>Day &amp; night service</li>
            <li>Quick response time</li>
            <li>Holiday availability</li>
          </ul>
        </div>

        <div className="service-card">
          <div className="service-title">Easy Booking</div>
          <ul className="service-list">
            <li>Real-time booking</li>
            <li>Driver tracking</li>
            <li>Instant confirmation</li>
          </ul>
        </div>

        <div className="service-card">
          <div className="service-title">Transparent Pricing</div>
          <ul className="service-list">
            <li>Up-front pricing</li>
            <li>Multiple payment options</li>
            <li>Digital receipts</li>
          </ul>
        </div>

        <div className="service-card">
          <div className="service-title">Safety First</div>
          <ul className="service-list">
            <li>Verified drivers</li>
            <li>Emergency support</li>
            <li>Ride sharing options</li>
          </ul>
        </div>

        <div className="service-card">
          <div className="service-title">Location Services</div>
          <ul className="service-list">
            <li>City-wide coverage</li>
            <li>Pickup from urban areas</li>
            <li>Destination tracking</li>
          </ul>
        </div>

        <div className="service-card">
          <div className="service-title">Customer Support</div>
          <ul className="service-list">
            <li>Live chat</li>
            <li>Phone support</li>
            <li>Email assistance</li>
          </ul>
        </div>
      </section>

      <section className="pricing-panel">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>
          Pricing Structure
        </h3>
        <div className="pricing-grid">
          <div>
            <div className="pricing-card-title">
              Base Fare – First 2 kilometers
            </div>
            <div className="pricing-amount">₱40.00</div>
          </div>
          <div>
            <div className="pricing-card-title">
              Per Kilometer – Additional distance
            </div>
            <div className="pricing-amount">₱15.00</div>
          </div>
          <div>
            <div className="pricing-card-title">
              Waiting Time – Per minute
            </div>
            <div className="pricing-amount">₱5.00</div>
          </div>
        </div>
      </section>
    </div>
  );
}
