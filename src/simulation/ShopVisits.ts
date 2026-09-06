import { shopInteriors, shopPoint } from './layout';
import type { JourneyStop } from './journey';
import type { AgentState, Vec2 } from './types';

export interface ShopVisit {
  shop: number;
  phase: 'entering' | 'queue' | 'service' | 'browsing' | 'dwell' | 'exiting';
  bay: number | null;
  path: Vec2[];
  duration: number;
}

/** Bounded FIFO queues and reserved activity places, all reached by walking. */
export class ShopVisits {
  readonly visits = new Map<number, ShopVisit>();
  private queues = shopInteriors.map(() => [] as number[]);
  private bays = shopInteriors.map(room => room.activities.map(() => null as number | null));

  enter(agent: AgentState, stop: JourneyStop): boolean {
    const queue = this.queues[stop.shop];
    if (queue.length >= shopInteriors[stop.shop].queue.length) return false;
    queue.push(agent.id);
    this.visits.set(agent.id, { shop: stop.shop, phase: 'entering', bay: null,
      path: [], duration: stop.duration });
    return true;
  }

  remove(id: number) {
    const visit = this.visits.get(id);
    if (!visit) return;
    this.queues[visit.shop] = this.queues[visit.shop].filter(other => other !== id);
    if (visit.bay !== null) this.bays[visit.shop][visit.bay] = null;
    this.visits.delete(id);
  }

  clear() { for (const id of this.visits.keys()) this.remove(id); }

  /** null means the customer has physically left the shop. */
  target(agent: AgentState, dt: number): Vec2 | null {
    const visit = this.visits.get(agent.id)!;
    const room = shopInteriors[visit.shop], queue = this.queues[visit.shop];
    const arrived = (p: Vec2) => Math.hypot(agent.position.x - p.x, agent.position.z - p.z) < 0.2;
    // Crossing the frontage completes a departure. Requiring all customers to
    // touch one point outside makes them repel each other and hold every bay.
    if (visit.phase === 'exiting' && Math.sign(room.exit.z) * agent.position.z > 18.1 + agent.radius) {
      this.remove(agent.id);
      return null;
    }
    if (visit.phase === 'entering') {
      // Start following the reserved FIFO place at the door. A shared entrance
      // waypoint lets later arrivals surround and trap the first customer.
      if (Math.abs(agent.position.z) < 17.3) visit.phase = 'queue';
      else return room.queue[queue.indexOf(agent.id)];
    }
    if (visit.phase === 'service' || visit.phase === 'dwell') {
      agent.dwellRemaining = Math.max(0, agent.dwellRemaining - dt);
      if (agent.dwellRemaining > 0) return agent.position;
      if (visit.phase === 'service') {
        queue.shift();
        const bay = room.activities[visit.bay!];
        visit.phase = 'browsing';
        visit.path = [shopPoint(visit.shop, -2.5, 6.5), shopPoint(visit.shop, -2.5, 4.15),
          { x: bay.x, z: shopPoint(visit.shop, 0, 4.15).z }, bay];
      } else {
        const aisle = shopPoint(visit.shop, 0, 4.15).z;
        visit.phase = 'exiting';
        visit.path = [{ x: agent.position.x, z: aisle }, shopPoint(visit.shop, 4, 4.15), room.exit];
      }
    }
    if (visit.phase === 'queue') {
      const index = queue.indexOf(agent.id), point = room.queue[index];
      if (index === 0 && arrived(point)) {
        const bay = this.bays[visit.shop].indexOf(null);
        if (bay >= 0) {
          this.bays[visit.shop][bay] = agent.id;
          visit.bay = bay; visit.phase = 'service';
          agent.dwellRemaining = 2.5;
          agent.velocity = { x: 0, z: 0 };
          return agent.position;
        }
      }
      return point;
    }
    // Aisle corners are passage areas, not reserved stopping places. Continue
    // around the corner before several walkers compete for the exact same point.
    if (visit.path.length && Math.hypot(agent.position.x - visit.path[0].x,
      agent.position.z - visit.path[0].z) < (visit.path.length > 1 ? 0.75 : 0.2)) visit.path.shift();
    if (visit.path.length) return visit.path[0];
    if (visit.phase === 'browsing') {
      visit.phase = 'dwell'; agent.dwellRemaining = visit.duration;
      agent.velocity = { x: 0, z: 0 };
      return agent.position;
    }
    this.remove(agent.id);
    return null;
  }
}
