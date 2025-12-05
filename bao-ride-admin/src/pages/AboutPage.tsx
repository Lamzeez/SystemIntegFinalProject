import React from "react";

export default function AboutPage() {
  return (
    <div className="page">
      <section className="panel">
        <h2 className="panel-title">About BAO RIDE</h2>
        <p className="info-panel-text">
          BAO RIDE is an innovative transportation solution designed
          specifically for Mati City. We provide an easy and convenient way to
          book Bao Bao (three-wheeled cab) rides, connecting passengers with
          reliable drivers throughout the city.
        </p>
        <p className="info-panel-text">
          Our mission is to modernize local transportation while preserving the
          traditional charm of Bao Bao rides. We ensure safe, affordable, and
          efficient travel for all residents and visitors of Mati City.
        </p>
      </section>

      <section className="icon-cards-row">
        <div className="icon-card">
          <h3 className="icon-card-title">City-Wide Coverage</h3>
          <p className="icon-card-subtitle">
            Available throughout Mati City for your convenience.
          </p>
        </div>

        <div className="icon-card">
          <h3 className="icon-card-title">24/7 Service</h3>
          <p className="icon-card-subtitle">
            Round-the-clock availability for your travel needs.
          </p>
        </div>

        <div className="icon-card">
          <h3 className="icon-card-title">Safe &amp; Secure</h3>
          <p className="icon-card-subtitle">
            Verified drivers and secure booking experience.
          </p>
        </div>

        <div className="icon-card">
          <h3 className="icon-card-title">Trusted Drivers</h3>
          <p className="icon-card-subtitle">
            Professional and courteous service every time.
          </p>
        </div>
      </section>
    </div>
  );
}
