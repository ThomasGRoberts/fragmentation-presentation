# Fragmentation carousel

A four-slide, ten-minute ESPL presentation about how one illustrative orbital breakup evolves at 300, 550, and 850 km. It is a controlled teaching comparison, **not** a validated debris forecast or a collision-risk estimate.

## Local use

Run `python3 server.py` here. Open `http://127.0.0.1:8773/?mode=review` for the review ribbon and spot comments, or `http://127.0.0.1:8773/?mode=present` for a clean presentation. Use the left and right arrow keys (or space to advance). The cards on slides 2 and 4 advance one at a time; clicking the slide also advances them. In review mode, slide 1 offers adjustable homepage artwork and a Save button. There are no on-screen previous/next slide controls. The review ribbon still allows direct jumps.

Slide 3 contains the complete demonstration: globe, an altitude selector, and a compact time and fragment count indicator. The three altitude scenes use the same synthetic ejection impulses. Drag to rotate the globe, scroll to zoom, and open “COMSPOC video” for an embedded example of an independently produced debris-cloud propagation. The embedded [AGI Indian ASAT Forensics video](https://www.youtube.com/watch?v=KYRHmEF1Azo) and [COMSPOC Mission Shakti simulation](https://www.comspoc.com/videos/comspoc-simulation-of-mission-shakti-asat-engagement-discrete-fragment-breakup-and-post-fragmentation-debris-cloud-evolution) are reference material. Their trajectories are not used in our model.

The globe slide plays automatically when opened. The time mapping moves through five scales: 0–48 hours, days 2–30, months 1–12, years 1–2, and years 2–8. A full cycle takes about five minutes, giving each scale roughly 48–69 seconds, holds the final view for five seconds, then loops. The bottom-corner indicator shows the current scale, elapsed time, and the surviving sample count. The three altitude buttons switch scenarios at the same elapsed time. Later playback strongly undersamples each roughly 90-minute orbit, so individual orbital motion can appear aliased. The Earth map stays fixed in model coordinates to avoid an additional visual alias and is not a ground-track display.

The server binds only to localhost. It stores review comments in this folder's `comments.json`, separate from the proximity presentation. To archive a verified round, POST `{"action":"archive-round","ids":["id1","id2"]}` to `/api/comments`; the server first writes a timestamped copy under `comment-archive/`. Existing open comments from the removed slides are mapped to the consolidated slide in the review UI until they are archived. New comments use the current four-slide numbering.

## Model

`build_data.py` generates 640 **equal-weight synthetic sample fragments** for each altitude with fixed seed `20261123`. Each fragment gets one radial, along-track, and cross-track ejection velocity, each drawn from a zero-mean Gaussian with 21 m/s standard deviation. Its area-to-mass ratio is drawn log-uniformly from 0.006–0.06 m²/kg. The same draws are reused at all three altitudes, so only the circular parent orbit altitude changes. Initial inclination is 53°. One displayed dot represents one modeled sample, **not** a weighted count of physical debris.

Each ejection impulse defines an individual Keplerian ellipse. The generator advances its mean anomaly and applies first-order secular J2 nodal and apsidal precession. Orbit-averaged drag changes specific orbital energy and angular momentum using twelve eccentric-anomaly samples per orbit, drag coefficient 2.2, and the fixed log-linear density profile in `build_data.py`. A fragment is removed when its modeled perigee drops to 120 km. A fragment whose initial perigee is already below that height still appears at the breakup point until its first inward crossing. The browser interpolates stored orbital elements and solves Kepler's equation at the selected time. It draws only fragment positions, not a single orbit trajectory shared by the fragments. The globe occludes dots behind Earth.

This is a simplified **secular** propagation, not a high-fidelity numerical orbit integrator. The density profile has no solar, geomagnetic, seasonal, or uncertainty variation. The model omits short-period J2 terms, third-body gravity, solar radiation pressure, fragment-fragment collisions, spacecraft maneuvers, and event-specific breakup physics. It does **not** implement the NASA Standard Breakup Model's size, area-to-mass, ejection-speed, or fragment-count distributions. In particular, eight-year survival numbers are model outputs only and should not be presented as real-event lifetime predictions. The qualitative altitude dependence follows [NASA's debris lifetime overview](https://orbitaldebris.jsc.nasa.gov/faq/).

`data.json` is generated locally from `build_data.py` and the preserved CelesTrak CSV. It contains 275 time snapshots for each live sample and is about 20.5 MB. Rebuild with `python3 build_data.py`.

## Research and speaking notes

See [SPEAKER_NOTES.md](SPEAKER_NOTES.md) for slide-by-slide interpretation, evidence, and limitations. Core sources include:

- NASA, [History of On-Orbit Satellite Fragmentations](https://www.orbitaldebris.jsc.nasa.gov/library/HOOSF_16e.pdf).
- NASA Orbital Debris Program Office, [Radar Measurements](https://orbitaldebris.jsc.nasa.gov/measurements/radar.html) and [DebriSat](https://orbitaldebris.jsc.nasa.gov/measurements/debrisat.html).
- Johnson et al., [NASA's New Breakup Model of EVOLVE 4.0](https://doi.org/10.1016/S0273-1177(01)00423-9) (2001).
- Vallado and Oltrogge, [Fragmentation Event Debris Field Evolution Using 3D Volumetric Risk Assessment](https://conference.sdo.esoc.esa.int/proceedings/sdc7/paper/738) (2017).

## Style and assets

The opening artwork uses the exact polyhedron and satellite field from the ESPL homepage hero banner. Its placement, polyhedron size, satellite count, and dot size can be adjusted and saved in the local review pane. The white globe with gray country boundaries and tiny gold markers follows the production Visualizing Proximity model's globe conventions. `vendor/countries-50m.json` is a local copy of the geography already bundled with that product. The ESPL mark is enlarged and gray like the other talk. The two carousels keep independent content, data, servers, and comments.
