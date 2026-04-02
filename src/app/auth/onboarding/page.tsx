"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/shared/brand-mark";

const slides = [
  {
    image: "/hero-storefront.jpg",
    alt: "Elegant storefront with warm lighting",
  },
  {
    image: "/hero-church.jpg",
    alt: "Beautiful church interior with warm light",
  },
  {
    image: "/hero-office.jpg",
    alt: "Modern office interior",
  },
];

export default function OnboardingPage() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="get-started-page">
      <div className="get-started-carousel" aria-hidden="true">
        {slides.map((slide, index) => (
          <div className={`get-started-slide ${index === activeSlide ? "is-active" : ""}`} key={slide.image}>
            <Image
              alt={slide.alt}
              className="get-started-slide__image"
              fill
              priority={index === 0}
              sizes="100vw"
              src={slide.image}
            />
          </div>
        ))}
        <div className="get-started-overlay" />
      </div>

      <section className="get-started-content">
        <div className="get-started-topbar">
          <BrandMark compact />
        </div>

        <div className="get-started-hero">
          <p className="get-started-kicker">Conversational workflows for organizations</p>
          <h1>
            <span className="get-started-hero__line">
              <span className="get-started-hero__line--accent">Run your community</span>
            </span>
            <span className="get-started-hero__line">through dialogue.</span>
          </h1>
          <p className="get-started-copy">
            Chertt brings operations, coordination, records, and requests into one chat-first experience for business,
            church, storefront, and events.
          </p>
        <div className="get-started-actions">
          <Link className="button button--primary get-started-button" href="/auth/modules">
            Get started
          </Link>
          <Link className="button button--ghost get-started-button get-started-button--secondary" href="/auth/sign-in">
            Log in
          </Link>
        </div>
      </div>

        <div className="get-started-dots" aria-label="Carousel indicators">
          {slides.map((slide, index) => (
            <button
              aria-label={`Show slide ${index + 1}`}
              className={`get-started-dot ${index === activeSlide ? "is-active" : ""}`}
              key={slide.image}
              onClick={() => setActiveSlide(index)}
              type="button"
            />
          ))}
        </div>
      </section>
    </main>
  );
}
