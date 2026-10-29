/** Allowlisted Network Automation show commands. The runner rejects anything outside this list. */
export const NA_COMMANDS = [
  "show ip interface brief",
  "show interfaces status",
  "show interfaces trunk",
  "show interface switchport",
  "show vlan brief",
  "show spanning-tree summary",
  "show cdp neighbors",
  "show ip route",
  "show ip protocols",
  "show ip ospf neighbor",
  "show ip bgp summary",
  "show ip arp",
  "show access-lists",
] as const;

export function isAllowlistedCommand(command: string): boolean {
  return (NA_COMMANDS as readonly string[]).includes(command);
}
