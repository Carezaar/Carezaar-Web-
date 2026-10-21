/** Whether the end of a list just came into view: true only on the change from out of view
 *  to in view, so a page that failed is asked for again only after the person scrolls away
 *  and back to the end, as on Android (parity review v6.0, G2). */
export function sentinelShouldFire(intersecting: boolean, wasInView: boolean): boolean {
  return intersecting && !wasInView;
}
