/** Metres and seconds. Simulation modules deliberately have no Three.js dependency. */
export interface Vec2 { x: number; z: number }
export interface AgentState {
  readonly id: number;
  position: Vec2;
  velocity: Vec2;
  readonly radius: number;
  readonly preferredSpeed: number;
  readonly direction: 1 | -1;
  readonly lane: number;
  progress: number;
  distance: number;
}
export interface CircleObstacle extends Vec2 { radius: number }
export interface Neighbor {
  readonly id: number;
  readonly position: Readonly<Vec2>;
  readonly velocity: Readonly<Vec2>;
  readonly radius: number;
}
export interface BehaviorContext {
  readonly dt: number;
  readonly time: number;
  readonly desiredVelocity: Readonly<Vec2>;
  readonly neighbors: readonly Neighbor[];
  readonly obstacles: readonly CircleObstacle[];
}
/** Return a desired velocity. Keep per-agent memory inside your behavior instance. */
export interface AgentBehavior {
  readonly name: string;
  computeVelocity(agent: Readonly<AgentState>, context: BehaviorContext): Vec2;
}
export type BehaviorFactory = (agentId: number) => AgentBehavior;
