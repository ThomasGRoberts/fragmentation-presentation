"""Build deterministic, explicitly illustrative debris trajectories and CelesTrak reference bins."""
import csv, json, math, random
from pathlib import Path
HERE=Path(__file__).resolve().parent
MU=3.986004418e14
RE=6371000.0
CD=2.2
FRAGMENTS=640
J2=1.08262668e-3
SEED=20261123
YEARS=8
DAY=86400.0
# Static density profile for a teaching model, not a forecast atmosphere.
DENSITY_KNOTS=[(120,2.0e-8),(150,2.0e-9),(180,4.0e-10),(250,7.0e-11),(300,2.0e-11),(400,3.0e-12),(550,2.0e-13),(700,3.0e-14),(850,6.0e-15),(1000,1.0e-15),(1400,2.0e-17)]

def density(h_km):
    for (h0,r0),(h1,r1) in zip(DENSITY_KNOTS,DENSITY_KNOTS[1:]):
        if h_km<=h1:
            f=(h_km-h0)/(h1-h0)
            return math.exp(math.log(r0)+f*(math.log(r1)-math.log(r0)))
    return DENSITY_KNOTS[-1][1]*math.exp(-(h_km-1400)/110)

def avg_drag(a,e,am):
    h=math.sqrt(MU*a*(1-e*e)); sum_e=sum_h=0.0
    for i in range(12):
        E=(i+.5)*math.tau/12
        weight=1-e*math.cos(E)
        r=a*weight
        v=math.sqrt(MU*(2/r-1/a))
        rho=density((r-RE)/1000)
        sum_e+=-.5*CD*am*rho*v**3*weight
        sum_h+=-.5*CD*am*rho*v*h*weight
    return sum_e/12,sum_h/12

def initial_fragments():
    rng=random.Random(SEED)
    result=[]
    inc=math.radians(53)
    tangent=(0,math.cos(inc),math.sin(inc))
    normal=(0,-math.sin(inc),math.cos(inc))
    for _ in range(FRAGMENTS):
        dv=[rng.gauss(0,21) for _ in range(3)]
        am=math.exp(rng.uniform(math.log(.006),math.log(.06)))
        result.append((dv,am))
    return result,tangent,normal

def first_inward_crossing(a,e,M,r_limit):
    """Days from the ejection point to the first inward 120 km crossing."""
    cos_f=max(-1.0,min(1.0,(a*(1-e*e)/r_limit-1)/e))
    f=math.tau-math.acos(cos_f)
    E=math.atan2(math.sqrt(1-e*e)*math.sin(f),e+math.cos(f))
    crossing_M=E-e*math.sin(E)
    return ((crossing_M-M)%math.tau)/math.sqrt(MU/a**3)/DAY

def build_one(altitude,fragment,tangent,normal,days):
    (dvr,dvt,dvn),am=fragment
    r=RE+altitude*1000
    speed=math.sqrt(MU/r)
    # A fixed radial/tangential/cross-track impulse is reused at every altitude.
    vx=dvr;vy=(speed+dvt)*tangent[1]+dvn*normal[1];vz=(speed+dvt)*tangent[2]+dvn*normal[2]
    v2=vx*vx+vy*vy+vz*vz
    energy=v2/2-MU/r
    a=-MU/(2*energy)
    hy=-r*vz;hz=r*vy
    h=math.hypot(hy,hz)
    q=[0,hz/h,-hy/h] # h_hat cross radial p_hat
    ecos=r*(vy*vy+vz*vz)/MU-1
    esin=-vx*h/MU
    e=min(.9,math.hypot(ecos,esin))
    omega=math.atan2(esin,ecos)
    f0=-omega
    E0=math.atan2(math.sqrt(1-e*e)*math.sin(f0),e+math.cos(f0))
    M=E0-e*math.sin(E0)
    inclination=math.acos(hz/h)
    cos_i=math.cos(inclination)
    raan=0.0
    perigee_angle=omega
    t=0.0;states=[];decay_day=None
    # Ω and ω are secular J2 angles. The ejection impulse determines each
    # fragment's own a, e, and orbital plane; there is no shared orbit guide.
    def snapshot():
        return [round(a/1000,5),round(e,9),round(M,7),
                round(raan,8),round(perigee_angle,8)]
    if a*(1-e)-RE<=120000:
        # These pieces are still at the 300 km breakup point. They remain
        # visible until their first inward atmospheric crossing, rather than
        # disappearing at the event merely because their future perigee is low.
        decay_day=first_inward_crossing(a,e,M,RE+120000)
        initial_M=M
        n=math.sqrt(MU/a**3)
        for target_day in days:
            if target_day>=decay_day:
                states.append(None)
            else:
                M=initial_M+n*target_day*DAY
                states.append(snapshot())
        return {'cosI':round(cos_i,9),'am':round(am,6),
                'dv':[round(x,3) for x in [dvr,dvt,dvn]],
                'decayDay':round(decay_day,6),'states':states}
    for target_day in days:
        while t < target_day-1e-9 and decay_day is None:
            perigee=(a*(1-e)-RE)/1000
            if perigee<=120:
                decay_day=t;break
            step=min(target_day-t,3.0 if perigee>450 else .5 if perigee<280 else 1.0)
            de,dh=avg_drag(a,e,am)
            da=(2*a*a/MU)*de
            # Limit a step near the steep atmosphere so reentry is resolved.
            step=min(step,max(.01,6_000/max(abs(da),.00001)/DAY))
            secs=step*DAY
            a_next=a+da*secs
            h_next=max(1.0,h+dh*secs)
            if a_next<=RE+120000:
                t+=step;decay_day=t;break
            e2=1-h_next*h_next/(MU*a_next)
            e_next=math.sqrt(max(0,min(.85* .85,e2)))
            if a_next*(1-e_next)-RE<=120000:
                t+=step;decay_day=t;break
            p=a*(1-e*e)
            mean_motion=math.sqrt(MU/a**3)
            j2_rate=J2*mean_motion*(RE/p)**2
            raan+=-1.5*j2_rate*cos_i*secs
            perigee_angle+=.75*j2_rate*(5*cos_i*cos_i-1)*secs
            # First-order secular J2 correction to anomalistic mean motion.
            j2_mean=.75*j2_rate*math.sqrt(1-e*e)*(3*cos_i*cos_i-1)
            M+=(mean_motion+math.sqrt(MU/a_next**3))*secs/2+j2_mean*secs
            a,h,e=a_next,h_next,e_next
            t+=step
        states.append(snapshot() if decay_day is None else None)
    return {'cosI':round(cos_i,9),'am':round(am,6),'dv':[round(x,3) for x in [dvr,dvt,dvn]],
            'decayDay':round(decay_day,6) if decay_day is not None else None,'states':states}

def active_catalog():
    rows=list(csv.DictReader(open(HERE / 'source' / 'celestrak-active-2026-11-22.csv')))
    bins=[0]*25;used=0;epochs=[]
    for row in rows:
        try:
            n=float(row['MEAN_MOTION'])*math.tau/DAY
            a=(MU/(n*n))**(1/3)
            alt=(a-RE)/1000
            if not math.isfinite(alt):continue
            used+=1;epochs.append(row['EPOCH'])
            index=math.floor(alt/50)
            if 0<=index<len(bins):bins[index]+=1
        except (ValueError,ZeroDivisionError):pass
    ordered=sorted(epochs)
    return {'source':'CelesTrak current GP, GROUP=active, FORMAT=csv','sourceUrl':'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv','retrievedUtc':'2026-11-22T00:00:00+00:00','catalogRecords':len(rows),'validOrbits':used,'shownInChart':sum(bins),'epochMedian':ordered[len(ordered)//2],'epochMin':min(epochs),'epochMax':max(epochs),'altitudeMeasure':'Circular-equivalent altitude from GP mean motion','binKm':50,'bins':bins,'rangeKm':[0,1250],'note':'CelesTrak active group is a catalog grouping; individual operational status was not independently verified. Static present-day reference, not a future forecast.'}

def main():
    days=[i/4 for i in range(9)]+list(range(3,31))+list(range(35,366,5))+list(range(380,YEARS*365+1,15))
    if days[-1]!=YEARS*365:days.append(YEARS*365)
    fragments,tangent,normal=initial_fragments()
    scenarios={}
    for altitude in [300,550,850]:
        items=[build_one(altitude,fragment,tangent,normal,days) for fragment in fragments]
        scenarios[str(altitude)]={'altitudeKm':altitude,'fragments':items}
        print(altitude, 'remaining at 1/3/8y', [sum(f['decayDay'] is None or f['decayDay']>d for f in items) for d in [365,1095,2920]])
    data={'schema':'espl-fragmentation-illustrative-v2','model':{'fragmentCount':FRAGMENTS,'seed':SEED,'horizonYears':YEARS,'inclinationDeg':53,'deltaVDescription':'Independent seeded Gaussian radial, tangential and cross-track components, each sigma 21 m/s; same draws across scenarios.','areaMassDescription':'Fixed seeded log-uniform 0.006–0.06 m²/kg; same draws across scenarios.','dragCoefficient':CD,'atmosphere':'Fixed log-linear density versus altitude, see build_data.py; no solar or geomagnetic variation.','propagation':'Each fragment starts on its own impulse-defined Keplerian ellipse; orbit-averaged drag changes energy and angular momentum, and secular J2 advances the node and perigee. No short-period J2, solar radiation pressure, collisions, or mass production model.','reentryCriterionKm':120,'sampleWeight':'One visual particle equals one modeled sample fragment; no scaling to a real breakup.'},'days':days,'activeCatalog':active_catalog(),'scenarios':scenarios}
    (HERE/'data.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    print('data bytes',(HERE/'data.json').stat().st_size,'catalog',data['activeCatalog']['shownInChart'])
if __name__=='__main__':main()
