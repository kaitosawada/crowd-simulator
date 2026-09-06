import type { AgentBehavior, AgentState, BehaviorContext, BehaviorFactory, Vec2 } from './types';

export class RouteFollowingBehavior implements AgentBehavior {
  readonly name = 'route';
  computeVelocity(_agent: Readonly<AgentState>, context: BehaviorContext): Vec2 { return { ...context.desiredVelocity }; }
}

/** Predictive steering, personal-space repulsion, and a consistent passing side.
 * This is a lightweight heuristic, not a calibrated social-force or ORCA solver.
 */
export class PredictiveAvoidanceBehavior implements AgentBehavior {
  readonly name = 'avoidance';
  computeVelocity(agent: Readonly<AgentState>, context: BehaviorContext): Vec2 {
    let { x, z } = context.desiredVelocity;
    const speed = Math.hypot(x, z) || 1, forwardX = x / speed, forwardZ = z / speed;
    for (const other of context.neighbors) {
      if (other.id === agent.id) continue;
      let dx = agent.position.x - other.position.x, dz = agent.position.z - other.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.001) { dx = agent.id < other.id ? 0.01 : -0.01; dz = 0.01; }
      const safeDistance = agent.radius + other.radius + 0.4;
      const rvx = x - other.velocity.x, rvz = z - other.velocity.z;
      const approachTime = Math.max(0, Math.min(1.8, -(dx * rvx + dz * rvz) / (rvx * rvx + rvz * rvz + 0.01)));
      const futureDistance = Math.hypot(dx + rvx * approachTime, dz + rvz * approachTime);
      const ahead = -dx * forwardX - dz * forwardZ;
      if (futureDistance < safeDistance && ahead > 0 && distance < 4) {
        const urgency = (1 - futureDistance / safeDistance) * (1 - approachTime / 2.2);
        // dx, dz point away from the other walker; the cross product's sign tells
        // which side they are on, so we can dodge toward the open side instead.
        const steer = context.directionalSwerve === false && forwardZ * dx - forwardX * dz < 0 ? -1 : 1;
        x += forwardZ * urgency * 1.8 * steer; z -= forwardX * urgency * 1.8 * steer;
        x -= forwardX * urgency * 0.5; z -= forwardZ * urgency * 0.5;
      }
      if (distance < safeDistance + 0.3) {
        const force = Math.max(0, safeDistance + 0.3 - distance) * 2.7;
        const length = Math.hypot(dx, dz);
        x += dx / length * force; z += dz / length * force;
      }
    }
    for (const c of context.obstacles) {
      const dx = agent.position.x - c.x, dz = agent.position.z - c.z;
      const d = Math.hypot(dx, dz), r = c.radius + agent.radius + 1;
      if (d < r && d > 0) { x += dx / d * (r - d) * 2; z += dz / d * (r - d) * 2; }
    }
    const magnitude = Math.hypot(x, z), limit = agent.preferredSpeed * 1.25;
    if (magnitude > limit) { x *= limit / magnitude; z *= limit / magnitude; }
    return { x, z };
  }
}

/** Register additional independent algorithms here; each agent gets its own instance. */
export const behaviorRegistry = new Map<string, { label: string; description?: string; factory: BehaviorFactory }>([
  ['avoidance', { label: '予測回避', description: '進路を予測し、周囲の人をよけながら歩きます。', factory: () => new PredictiveAvoidanceBehavior() }],
  ['route', { label: '経路追従のみ', description: '人との回避なし。経路に沿って歩く比較用モードです。', factory: () => new RouteFollowingBehavior() }],
]);
