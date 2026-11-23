# Speaker notes · Consequences of destructive events in orbit

These are talking points for the four-slide version. The animation uses the declared illustrative model in [README.md](README.md), rather than trajectories or fragment counts from any historical event.

## 1 · The consequences

A destructive event can impose costs on operators other than the owner of the target. Separate three questions as the talk proceeds: what the breakup creates, how those pieces move and persist, and which spacecraft might be exposed. The globe shows fragment locations and persistence; it does not calculate spacecraft exposure.

## 2 · What determines the consequences?

- **Breakup severity:** Number, mass, area-to-mass ratio, and imparted velocity determine the initial debris population. The [NASA Standard Breakup Model paper](https://doi.org/10.1016/S0273-1177(01)00423-9) is the appropriate starting point for empirical fragment distributions. This presentation samples fixed Gaussian impulses and log-uniform area-to-mass ratios **instead** of implementing that model.
- **Orbital altitude and atmosphere:** Drag depends on atmospheric density along the orbit and on each piece's area-to-mass ratio. The fixed density table here is for a controlled comparison. Solar and geomagnetic variation would change real lifetimes. [NASA's debris FAQ](https://orbitaldebris.jsc.nasa.gov/faq/) describes the general altitude dependence.
- **Timing:** Fragments can move around Earth before other operators can observe, assess, and respond. Timing is an operational question as well as a physical one. It requires event-specific tracking and conjunction analysis; no such analysis is in this demo.

## 3 · One breakup, three altitudes

Start at **850 km** and let the automatically looping first two days play. All 640 sample dots begin at the same breakup position. Each gets its own three-dimensional ejection impulse, so there is no single path to draw. Differences in orbital period stretch the cloud along track into the familiar arc. For a nearly circular orbit, a small along-track velocity difference gives approximately `Δn/n ≈ -3 Δv_t/v`; a 21 m/s impulse scale around 550 km corresponds to tens of degrees of along-track drift per day. Cross-track impulses and Earth's J2 gravity gradually separate orbital planes. The bottom-corner label shows the current time scale and modeled surviving samples; the years-long time lapse aliases individual roughly 90-minute revolutions.

Switch between **300, 550, and 850 km** at the same elapsed time. The matching sample index has the same ejection impulse and area-to-mass ratio in all three cases. Under this *fixed* atmosphere, many low-altitude samples decay quickly, some at 550 km survive eight years, and all at 850 km survive eight years. These numerical fractions are **not predictions** for a real breakup. The model excludes event-specific fragment distributions, atmospheric variability, spacecraft maneuvers, and collision chains.

The [AGI Indian ASAT Forensics video](https://www.youtube.com/watch?v=KYRHmEF1Azo) and [COMSPOC's Mission Shakti simulation](https://www.comspoc.com/videos/comspoc-simulation-of-mission-shakti-asat-engagement-discrete-fragment-breakup-and-post-fragmentation-debris-cloud-evolution) are independent visual references. [Vallado and Oltrogge (2017)](https://conference.sdo.esoc.esa.int/proceedings/sdc7/paper/738) describe a more complete three-dimensional debris-field evolution and volumetric risk method; they combine breakup distributions with propagation and evaluate satellites potentially put at risk. This slide only visualizes sample propagation at three starting altitudes.

## 4 · What remains unknown?

Do **not** say there have been very few fragmentation events in general. NASA's [historical breakup catalog](https://www.orbitaldebris.jsc.nasa.gov/library/HOOSF_16e.pdf) documents hundreds. The narrower point is that detailed evidence from past destructive cases and ground experiments does not span every target construction, impact mechanism, orbit, and fragment size we may wish to assess.

Small pieces are especially difficult to characterize. [NASA's radar program](https://orbitaldebris.jsc.nasa.gov/measurements/radar.html) statistically samples objects too small for routine individual tracking. NASA's [2025 size-estimation report](https://ntrs.nasa.gov/citations/20250000780) explains that radar cross section is not physical size; a model infers size, and materials and shape affect that inference. [DebriSat](https://orbitaldebris.jsc.nasa.gov/measurements/debrisat.html) was designed to improve modern-satellite breakup models with laboratory fragment measurements, including small pieces.

Even a good debris field estimate would not itself tell us whose satellite will be hit. Event-specific exposure needs propagated uncertainties, current object orbits, screening, operator response, and atmospheric conditions. This presentation deliberately stops before claiming a collision probability or assigning responsibility for particular future impacts.

## Model caveat in one sentence

“Every dot follows its own impulse-defined orbit with approximate drag and J2 precession, so the motion is physically interpretable, but the synthetic breakup and static atmosphere make the survival numbers illustrative.”
