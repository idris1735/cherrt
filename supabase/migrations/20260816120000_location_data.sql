-- P2 follow-up (2026-08-16): structured location + Google Maps capture.
-- State joins city/country on the KYC application; lat/lng come from the
-- Google Maps address pick (null when the address was typed manually).
alter table kyc_applications
  add column if not exists state text,
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision;

alter table workspaces
  add column if not exists state text;
