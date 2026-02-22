import { useState, useEffect, useRef, useCallback } from "react";
import { TOPO_IMAGES } from "./topoImages";

// ─── LAB DATA ────────────────────────────────────────────────────────────────
// Each task now has: hint (solution commands), check (array of keyword arrays to verify)
// check: each inner array = one required command. All inner arrays must match for task to pass.
// A command matches if ALL keywords in the inner array appear in any single command entered on the correct device.

const LABS = [
  {
    id: 1, title: "Static Routes & OSPF", category: "Routing",
    source: "Q214s",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.13.1/24", status: "up" }, "Ethernet0/1": { ip: "10.10.12.1/25", status: "up" }, "Ethernet0/2": { ip: "10.10.12.129/25", status: "up" }, "Loopback0": { ip: "10.10.1.1/32", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.31.2/24", status: "up" }, "Ethernet0/1": { ip: "10.10.12.2/25", status: "up" }, "Ethernet0/2": { ip: "10.10.12.130/25", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.13.3/24", status: "up" }, "Ethernet0/1": { ip: "10.10.254.3/24", status: "up" } } }
    ],
    topology: `Internet (172.20.20.128/25)\n    |.254\n   R3 (E0/1)\n    |E0/0 .3\n    | 10.10.13.0/24\n    |E0/0 .1\n   R1 ──E0/1(.1)── 10.10.12.0/25 ──E0/1(.2)── R2\n    └──E0/2(.129)── 10.10.12.128/25 ──E0/2(.130)─┘\n                                         E0/0 .2\n                                    10.10.31.0/24\n                                         E0/0 .1\n                                         SW1\n                                    LAN: 192.168.0.0/24`,
    tasks: [
      { id: 1, text: "Configure reachability to the switch SW1 LAN subnet (192.168.0.0/24) in router R2", device: "R2",
        hint: "ip route 192.168.0.0 255.255.255.0 10.10.31.1",
        check: [["ip route","192.168.0.0","255.255.255.0","10.10.31.1"]] },
      { id: 2, text: "Configure default reachability to the Internet subnet (172.20.20.128/25) in router R1", device: "R1",
        hint: "ip route 0.0.0.0 0.0.0.0 10.10.13.3",
        check: [["ip route","0.0.0.0","0.0.0.0","10.10.13.3"]] },
      { id: 3, text: "Configure a single static route in R2 to reach the Internet subnet (172.20.20.128/25) via both redundant links (ECMP). No default route allowed.", device: "R2",
        hint: "ip route 172.20.20.128 255.255.255.128 10.10.12.1\nip route 172.20.20.128 255.255.255.128 10.10.12.129",
        check: [["ip route","172.20.20.128","255.255.255.128","10.10.12.1"],["ip route","172.20.20.128","255.255.255.128","10.10.12.129"]] },
      { id: 4, text: "Configure static route on R1 toward SW1 LAN. Primary via E0/1 (next-hop 10.10.12.2), backup via E0/2 (floating route, AD 2)", device: "R1",
        hint: "ip route 192.168.0.0 255.255.255.0 10.10.12.2\nip route 192.168.0.0 255.255.255.0 10.10.12.130 2",
        check: [["ip route","192.168.0.0","255.255.255.0","10.10.12.2"],["ip route","192.168.0.0","255.255.255.0","10.10.12.130","2"]] }
    ]
  },
  {
    id: 2, title: "NAT, NTP, DHCP & SSH", category: "IP Services",
    source: "QLab211-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.1.1.1/24", status: "up" }, "Ethernet0/2": { ip: "10.1.2.1/24", status: "up" }, "Loopback0": { ip: "192.168.100.1/24", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.1.1.2/24", status: "up" }, "Ethernet0/1": { ip: "10.1.3.1/24", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/1": { ip: "10.1.3.3/24", status: "up" }, "Ethernet0/2": { ip: "dhcp", status: "up" } } }
    ],
    topology: `R1 (Lo0: 192.168.100.1)\n  E0/0 ── 10.1.1.0/24 ── E0/0 R2 E0/1 ── 10.1.3.0/24 ── E0/1 R3\n  E0/2 ── 10.1.2.0/24`,
    tasks: [
      { id: 1, text: "Configure NAT on R2: Translate R3 source to R2 E0/0 IP using standard ACL named PUBNET. No NVI.", device: "R2",
        hint: "ip nat inside source list PUBNET interface Ethernet0/0 overload\nip access-list standard PUBNET\npermit 10.1.3.0 0.0.0.255\ninterface Ethernet0/1\nip nat inside\ninterface Ethernet0/0\nip nat outside",
        check: [["ip nat inside source list","pubnet","interface","ethernet0/0","overload"],["ip access-list standard","pubnet"],["permit","10.1.3.0","0.0.0.255"],["ip nat inside"],["ip nat outside"]] },
      { id: 2, text: "Configure R1 as NTP master server. Set clock to midnight May 1, 2018. Configure R2 as NTP client using R1 E0/2 IP (10.1.2.1).", device: "R1",
        hint: "On R1:\nntp master\nclock set 00:00:00 May 1 2018\n\nOn R2:\nntp server 10.1.2.1",
        check: [["ntp master"]] },
      { id: 3, text: "Configure R1 DHCP server: pool NETPOOL, network 10.1.3.0/24, exclude addresses 1-10.", device: "R1",
        hint: "ip dhcp excluded-address 10.1.3.1 10.1.3.10\nip dhcp pool NETPOOL\nnetwork 10.1.3.0 255.255.255.0",
        check: [["ip dhcp excluded-address","10.1.3.1","10.1.3.10"],["ip dhcp pool","netpool"],["network","10.1.3.0","255.255.255.0"]] },
      { id: 4, text: "Configure SSH on R3: user netadmin/N3t4ccess, RSA 1024 bits, SSH only on VTY lines.", device: "R3",
        hint: "username netadmin password N3t4ccess\nip domain-name lab.local\ncrypto key generate rsa\n1024\nline vty 0 4\ntransport input ssh\nlogin local",
        check: [["username","netadmin"],["crypto key generate rsa"],["transport input ssh"],["login local"]] }
    ]
  },
  {
    id: 3, title: "VLANs & Access Ports", category: "Switching",
    source: "QLab211-Sim2",
    devices: [
      { name: "SW1", type: "switch", hostname: "SW1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW2", type: "switch", hostname: "SW2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW1 (E0/0) ──── VLAN 12 ──── (E0/0) SW2\n │E0/1                          │E0/1\n Phone+PC                       PC\n VLAN 12+34                   VLAN "Available"`,
    tasks: [
      { id: 1, text: "Configure VLAN 12 named Compute and VLAN 34 named Telephony on SW1", device: "SW1",
        hint: "vlan 12\nname Compute\nvlan 34\nname Telephony",
        check: [["vlan","12"],["name","compute"],["vlan","34"],["name","telephony"]] },
      { id: 2, text: "Configure E0/1 on SW2 as access port using the existing VLAN named Available", device: "SW2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan <Available VLAN ID>",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Configure E0/0 on both switches as access ports for VLAN 12", device: "SW1",
        hint: "interface Ethernet0/0\nswitchport mode access\nswitchport access vlan 12\n\n! Also on SW2:\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 12",
        check: [["switchport mode access"],["switchport access vlan","12"]] },
      { id: 4, text: "Configure E0/1 on SW1 with data VLAN 12 and voice VLAN 34", device: "SW1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 12\nswitchport voice vlan 34",
        check: [["switchport access vlan","12"],["switchport voice vlan","34"]] },
      { id: 5, text: "Disable CDP on E0/1 of SW2 (interface only, not globally)", device: "SW2",
        hint: "interface Ethernet0/1\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 4, title: "User Account, ACL & DHCP Snooping (Variant A)", category: "Security",
    source: "Q213",
    devices: [
      { name: "Gw1", type: "router", hostname: "Gw1", interfaces: { "Ethernet0/0": { ip: "10.10.10.1/24", status: "up" } } },
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Internet ── Gw1 ── Sw1 ── PCs\n               VLAN 10`,
    tasks: [
      { id: 1, text: "Configure local account on Gw1: username wheel, password lock3path, algorithm scrypt, exec privilege. Telnet only on VTY 0-4.", device: "Gw1",
        hint: "username wheel algorithm-type scrypt secret lock3path\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","wheel"],["secret","lock3path"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL CORP_ACL on Gw1: allow BOOTP (UDP 67-68) and HTTPS (TCP 443), deny all other traffic with log-input", device: "Gw1",
        hint: "ip access-list extended CORP_ACL\npermit udp any any range 67 68\npermit tcp any any eq 443\ndeny ip any any log-input",
        check: [["ip access-list extended","corp_acl"],["permit udp","67","68"],["permit tcp","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw1: enable for VLAN 10, disable Option-82, enable MAC verification, set trusted interfaces", device: "Sw1",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 10\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address\ninterface Ethernet0/0\nip dhcp snooping trust",
        check: [["ip dhcp snooping vlan","10"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"],["ip dhcp snooping trust"]] }
    ]
  },
  {
    id: 5, title: "User Account, ACL & DHCP Snooping (Variant B)", category: "Security",
    source: "Q214",
    devices: [
      { name: "Gw1", type: "router", hostname: "Gw1", interfaces: { "Ethernet0/0": { ip: "10.10.10.1/24", status: "up" } } },
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Internet ── Gw1 ── Sw1 ── PCs\n               VLAN 10`,
    tasks: [
      { id: 1, text: "Configure local account on Gw1: username wheel, password lock3path, algorithm scrypt, exec privilege. Telnet only on VTY 0-4.", device: "Gw1",
        hint: "username wheel algorithm-type scrypt secret lock3path\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","wheel"],["secret","lock3path"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL CORP_ACL on Gw1: allow BOOTP and HTTPS, deny rest with log-input", device: "Gw1",
        hint: "ip access-list extended CORP_ACL\npermit udp any any range 67 68\npermit tcp any any eq 443\ndeny ip any any log-input",
        check: [["ip access-list extended","corp_acl"],["permit udp","67","68"],["permit tcp","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw1: enable for VLAN 10, disable Option-82, enable MAC verification, set trusted interfaces", device: "Sw1",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 10\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address\ninterface Ethernet0/0\nip dhcp snooping trust",
        check: [["ip dhcp snooping vlan","10"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"],["ip dhcp snooping trust"]] }
    ]
  },
  {
    id: 6, title: "OSPF Configuration", category: "Routing",
    source: "Q227",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.1/30", status: "up" }, "Loopback1": { ip: "1.1.1.1/32", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.12.2/30", status: "up" }, "Ethernet0/1": { ip: "10.10.23.2/30", status: "up" }, "Loopback1": { ip: "2.2.2.2/32", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.23.3/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.3/30", status: "up" }, "Loopback1": { ip: "3.3.3.3/32", status: "up" } } }
    ],
    topology: `R1 (Lo1: 1.1.1.1) ──E0/0── 10.10.12.0/30 ──E0/0── R2 (Lo1: 2.2.2.2)\n │E0/1                                              │E0/1\n 10.10.13.0/30                                   10.10.23.0/30\n │E0/1                                              │E0/0\n R3 (Lo1: 3.3.3.3)`,
    tasks: [
      { id: 1, text: "Configure R1 router-id as 10.10.12.1 and R2 router-id as 10.10.12.2 (shared link IPs)", device: "R1",
        hint: "router ospf 1\nrouter-id 10.10.12.1\n\n! On R2:\nrouter ospf 1\nrouter-id 10.10.12.2",
        check: [["router ospf"],["router-id","10.10.12.1"]] },
      { id: 2, text: "Set R2 OSPF priority to max (255) on E0/0 and E0/1 so R2 becomes DR. R1 and R3 keep defaults.", device: "R2",
        hint: "interface Ethernet0/0\nip ospf priority 255\ninterface Ethernet0/1\nip ospf priority 255",
        check: [["ip ospf priority","255"]] },
      { id: 3, text: "Advertise each router's Loopback1 in OSPF using host wildcard mask (0.0.0.0) on all three routers", device: "R1",
        hint: "router ospf 1\nnetwork 1.1.1.1 0.0.0.0 area 0\n\n! On R2: network 2.2.2.2 0.0.0.0 area 0\n! On R3: network 3.3.3.3 0.0.0.0 area 0",
        check: [["network","0.0.0.0","area"]] },
      { id: 4, text: "Configure passive-interface on R1 E0/1 and R3 E0/1 (the R1-R3 link) to prevent new OSPF neighbors", device: "R1",
        hint: "router ospf 1\npassive-interface Ethernet0/1\n\n! On R3:\nrouter ospf 1\npassive-interface Ethernet0/1",
        check: [["passive-interface"]] }
    ]
  },
  {
    id: 7, title: "Static Routes to ISP & LAN", category: "Routing",
    source: "Q244",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.0.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.0.13.1/30", status: "up" }, "Ethernet0/2": { ip: "209.165.200.225/27", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.0.12.2/30", status: "up" }, "Ethernet0/1": { ip: "10.0.24.2/30", status: "up" }, "Ethernet0/2": { ip: "209.165.200.226/27", status: "up" } } }
    ],
    topology: `ISP (209.165.200.224/27)\n  │E0/2\n  R1 ──E0/0── 10.0.12.0/30 ──E0/0── R2\n  │E0/1                              │E0/1\n  10.0.13.0/30 ──R3                  10.0.24.0/30 ──R4\n                                     LAN: 10.0.41.0/24`,
    tasks: [
      { id: 1, text: "Configure a default route on R2 to the ISP (via 209.165.200.225)", device: "R2",
        hint: "ip route 0.0.0.0 0.0.0.0 209.165.200.225",
        check: [["ip route","0.0.0.0","0.0.0.0"]] },
      { id: 2, text: "Configure a default route on R1 to the ISP (via 209.165.200.226 or directly connected)", device: "R1",
        hint: "ip route 0.0.0.0 0.0.0.0 209.165.200.226",
        check: [["ip route","0.0.0.0","0.0.0.0"]] },
      { id: 3, text: "Configure R2 with a route to the Server at 10.0.41.10/32 via R4 (10.0.24.4)", device: "R2",
        hint: "ip route 10.0.41.0 255.255.255.0 10.0.24.4",
        check: [["ip route","10.0.41"]] },
      { id: 4, text: "Configure R1 with a route to the LAN (10.0.41.0/24) that prefers R3 as primary path", device: "R1",
        hint: "ip route 10.0.41.0 255.255.255.0 10.0.13.3\nip route 10.0.41.0 255.255.255.0 10.0.12.2 2",
        check: [["ip route","10.0.41.0","255.255.255.0"]] }
    ]
  },
  {
    id: 8, title: "VLANs, CDP & LLDP", category: "Switching",
    source: "Q252-Sim1",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/2)──(E0/2)SW-2(E0/0)──R2\n          │E0/1              │E0/1\n          PC1(VLAN15)        PC2(VLAN66)`,
    tasks: [
      { id: 1, text: "Configure VLAN 15 named OPS on SW-1", device: "SW-1",
        hint: "vlan 15\nname OPS",
        check: [["vlan","15"],["name","ops"]] },
      { id: 2, text: "Configure VLAN 66 named ENGINEERING on SW-2", device: "SW-2",
        hint: "vlan 66\nname ENGINEERING",
        check: [["vlan","66"],["name","engineering"]] },
      { id: 3, text: "Configure SW-1 E0/1 as access port for VLAN 15 (PC1)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 15",
        check: [["switchport mode access"],["switchport access vlan","15"]] },
      { id: 4, text: "Configure SW-2 E0/1 as access port for VLAN 66 (PC2)", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 66",
        check: [["switchport mode access"],["switchport access vlan","66"]] },
      { id: 5, text: "Enable LLDP on E0/2 (vendor-neutral) and ensure CDP stays on E0/0 (Cisco proprietary) on both switches", device: "SW-1",
        hint: "interface Ethernet0/2\nlldp transmit\nlldp receive\nno cdp enable\ninterface Ethernet0/0\ncdp enable",
        check: [["lldp transmit"],["lldp receive"]] }
    ]
  },
  {
    id: 9, title: "VLANs, LLDP & Access Ports", category: "Switching",
    source: "Q252-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──SW-1(E0/1)──PC1(VLAN35)\n      │E0/0\n      │E0/0\n    SW-2(E0/1)──PC2(VLAN39)`,
    tasks: [
      { id: 1, text: "Configure VLAN 35 named SALES on SW-1", device: "SW-1",
        hint: "vlan 35\nname SALES",
        check: [["vlan","35"],["name","sales"]] },
      { id: 2, text: "Configure VLAN 39 named MARKETING on SW-2", device: "SW-2",
        hint: "vlan 39\nname MARKETING",
        check: [["vlan","39"],["name","marketing"]] },
      { id: 3, text: "Configure SW-1 E0/1 as access port for PC1 (VLAN 35)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 35",
        check: [["switchport mode access"],["switchport access vlan","35"]] },
      { id: 4, text: "Configure SW-2 E0/1 as access port for PC2 (VLAN 39)", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 39",
        check: [["switchport mode access"],["switchport access vlan","39"]] },
      { id: 5, text: "Enable LLDP globally on both switches, disable LLDP on SW-1 E0/1 (PC1 interface)", device: "SW-1",
        hint: "lldp run\ninterface Ethernet0/1\nno lldp transmit\nno lldp receive\n\n! On SW-2:\nlldp run",
        check: [["lldp run"],["no lldp transmit"]] }
    ]
  },
  {
    id: 10, title: "Trunking, Native VLAN & LACP", category: "Switching",
    source: "Q254",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-1(E0/0,E0/1)══Po══(E0/0,E0/1)SW-2\n │E0/2                          │E0/2\n SW-3(E0/0)              SW-3(E0/1)`,
    tasks: [
      { id: 1, text: "Configure SW-1 and SW-2 E0/0 and E0/1 as 802.1q trunks allowing all VLANs", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"]] },
      { id: 2, text: "Set native VLAN 35 on inter-switch links: SW-1 E0/2, SW-2 E0/2, SW-3 E0/0 and E0/1", device: "SW-1",
        hint: "interface Ethernet0/2\nswitchport trunk native vlan 35",
        check: [["switchport trunk native vlan","35"]] },
      { id: 3, text: "Configure LACP on SW-1 E0/0+E0/1 (active) and SW-2 E0/0+E0/1 (passive)", device: "SW-1",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-2:\ninterface Ethernet0/0\nchannel-group 1 mode passive\ninterface Ethernet0/1\nchannel-group 1 mode passive",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 11, title: "Trunking, LACP & Native VLAN", category: "Switching",
    source: "Q257",
    devices: [
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `SW-1══(E0/0)SW-2(E0/2,E0/3)══Po══(E0/2,E0/3)SW-3(E0/0)══SW-4\n              VLAN 10,11`,
    tasks: [
      { id: 1, text: "Configure SW-2 and SW-3 E0/0 as 802.1q trunks allowing only VLAN 10", device: "SW-2",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 10",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","10"]] },
      { id: 2, text: "Set native VLAN 11 on SW-2 and SW-3 E0/0 for untagged traffic", device: "SW-2",
        hint: "interface Ethernet0/0\nswitchport trunk native vlan 11",
        check: [["switchport trunk native vlan","11"]] },
      { id: 3, text: "Configure SW-2 and SW-3 E0/2+E0/3 as 802.1q trunks allowing all VLANs", device: "SW-2",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\ninterface Ethernet0/3\nswitchport trunk encapsulation dot1q\nswitchport mode trunk",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"]] },
      { id: 4, text: "Configure LACP: SW-2 E0/2+E0/3 passive, SW-3 E0/2+E0/3 active, use designated port-channel number", device: "SW-2",
        hint: "interface Ethernet0/2\nchannel-group 1 mode passive\ninterface Ethernet0/3\nchannel-group 1 mode passive\n\n! On SW-3:\ninterface Ethernet0/2\nchannel-group 1 mode active\ninterface Ethernet0/3\nchannel-group 1 mode active",
        check: [["channel-group","mode passive"]] }
    ]
  },
  {
    id: 12, title: "Trunk Filtering, LACP & Native VLAN", category: "Switching",
    source: "Q262",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-4", type: "switch", hostname: "SW-4", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/1)──(E0/1)SW-2(E0/2)──SW-3/SW-4\n VLANs 5,6,77`,
    tasks: [
      { id: 1, text: "Configure SW-1 E0/0 trunk to permit only VLANs 5 and 6", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk allowed vlan 5,6",
        check: [["switchport trunk allowed vlan","5","6"]] },
      { id: 2, text: "Configure SW-1 and SW-2 E0/1 with native VLAN 77 for untagged traffic", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport trunk native vlan 77",
        check: [["switchport trunk native vlan","77"]] },
      { id: 3, text: "Configure SW-2 E0/2 trunk to permit only VLAN 6", device: "SW-2",
        hint: "interface Ethernet0/2\nswitchport trunk allowed vlan 6",
        check: [["switchport trunk allowed vlan","6"]] },
      { id: 4, text: "Configure LACP: SW-3 E0/0+E0/1 active, SW-4 E0/0+E0/1 passive", device: "SW-3",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-4:\ninterface Ethernet0/0\nchannel-group 1 mode passive\ninterface Ethernet0/1\nchannel-group 1 mode passive",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 13, title: "User Account, ACL & DHCP Snooping (Variant C)", category: "Security",
    source: "Q267",
    devices: [
      { name: "Sw103", type: "switch", hostname: "Sw103", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "172.16.0.1/16", status: "up" } } },
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `Internet ── R1 ── Sw101 ── Sw103 ── PCs\n               VLAN 101`,
    tasks: [
      { id: 1, text: "Configure local account on Sw103: username devnet, password access8cli, SHA256, exec privilege. Telnet on VTY 0-4.", device: "Sw103",
        hint: "username devnet algorithm-type sha256 secret access8cli\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","devnet"],["secret","access8cli"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Modify NACL INTERNET_ACL on R1: allow HTTPS from 172.16.0.0/16, allow telnet for VLAN 101 only, deny rest with log-input", device: "R1",
        hint: "ip access-list extended INTERNET_ACL\npermit tcp 172.16.0.0 0.0.255.255 any eq 443\npermit tcp <VLAN101-subnet> <wildcard> any eq 23\ndeny ip any any log-input",
        check: [["ip access-list extended","internet_acl"],["permit tcp","172.16","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw101: enable for VLAN 101, disable Option-82, enable MAC verification", device: "Sw101",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 101\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address",
        check: [["ip dhcp snooping vlan","101"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"]] }
    ]
  },
  {
    id: 14, title: "IPv4 & IPv6 Subnetting", category: "IP Services",
    source: "Q268-Sim1",
    devices: [
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "Sw102", type: "switch", hostname: "Sw102", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `Sw101(E0/0) ──── (E0/0)Sw102\n  64 sites needed\n  IPv4: 10.30.64.0/19\n  IPv6: 2001:db8::/56`,
    tasks: [
      { id: 1, text: "Subnet 10.30.64.0/19 for 64 sites, max hosts. Use 2nd subnet: assign first usable IP to Sw101 E0/0, last usable to Sw102 E0/0", device: "Sw101",
        hint: "! /19 into 64 subnets = /25 (128 hosts each)\n! 1st subnet: 10.30.64.0/25 (unavailable)\n! 2nd subnet: 10.30.64.128/25\n! First usable: 10.30.64.129, Last usable: 10.30.64.254\n\ninterface Ethernet0/0\nip address 10.30.64.129 255.255.255.128\nno shutdown\n\n! On Sw102:\ninterface Ethernet0/0\nip address 10.30.64.254 255.255.255.128\nno shutdown",
        check: [["ip address","10.30.64.129","255.255.255.128"]] },
      { id: 2, text: "Subnet 2001:db8::/56 for 64 sites. Use 2nd subnet. Assign IPv6 GUA with EUI-64 on both switches E0/0", device: "Sw101",
        hint: "! /56 into 64 subnets = /62... but we need /64 for EUI-64\n! 2nd /64 subnet: 2001:db8:0:1::/64\n\ninterface Ethernet0/0\nipv6 address 2001:db8:0:1::/64 eui-64\nno shutdown\n\n! On Sw102:\ninterface Ethernet0/0\nipv6 address 2001:db8:0:1::/64 eui-64\nno shutdown",
        check: [["ipv6 address","2001:db8","eui-64"]] }
    ]
  },
  {
    id: 15, title: "IPv6 Static & Floating Routes", category: "Routing",
    source: "Q268-Sim2",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "2001:db8:12::1/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:13::1/64", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "2001:db8:12::2/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:24::2/64", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "2001:db8:34::3/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:13::3/64", status: "up" } } }
    ],
    topology: `R1 ──E0/0── R2 ──E0/1── 2001:db8:41::/64\n │E0/1\n R3 ──E0/0── 2001:db8:41::/64 (backup)`,
    tasks: [
      { id: 1, text: "Configure IPv6 route on R1 to 2001:db8:41::/64 via R2 (preferred, default AD)", device: "R1",
        hint: "ipv6 route 2001:db8:41::/64 2001:db8:12::2",
        check: [["ipv6 route","2001:db8:41::/64","2001:db8:12::2"]] },
      { id: 2, text: "Configure floating IPv6 route on R1 to 2001:db8:41::/64 via R3 (higher AD for backup)", device: "R1",
        hint: "ipv6 route 2001:db8:41::/64 2001:db8:13::3 2",
        check: [["ipv6 route","2001:db8:41::/64","2001:db8:13::3"]] }
    ]
  },
  {
    id: 16, title: "Voice VLAN, LLDP & CDP", category: "Switching",
    source: "Q269",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/2)──(E0/0)SW-2\n          │E0/1              │E0/1\n         Phone+PC            PC2`,
    tasks: [
      { id: 1, text: "Configure SW-1 E0/1 for IP phone + PC (access + voice VLANs)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 10\nswitchport voice vlan 20",
        check: [["switchport access vlan"],["switchport voice vlan"]] },
      { id: 2, text: "Configure SW-2 E0/1 as access port for PC2", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 10",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Configure VLAN 10 named Engineering on SW-1", device: "SW-1",
        hint: "vlan 10\nname Engineering",
        check: [["vlan","10"],["name","engineering"]] },
      { id: 4, text: "Enable LLDP (vendor-neutral) on the link between SW-1 and SW-2 (E0/2 and E0/0)", device: "SW-1",
        hint: "interface Ethernet0/2\nlldp transmit\nlldp receive\n\n! On SW-2 E0/0:\nlldp transmit\nlldp receive",
        check: [["lldp transmit"],["lldp receive"]] },
      { id: 5, text: "Disable CDP on SW-1 E0/0 (link to R1)", device: "SW-1",
        hint: "interface Ethernet0/0\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 17, title: "Voice & Data VLANs + LLDP", category: "Switching",
    source: "Q270-Sim1",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `Sw1(E0/0)──(E0/0)Sw2\n │E0/1,E0/2,E0/3      │E0/1,E0/2,E0/3\n Phone+PCs             Phone+PCs\n Data VLAN + Voice VLAN`,
    tasks: [
      { id: 1, text: "Configure both VLANs on Sw1 and Sw2 with names from topology", device: "Sw1",
        hint: "vlan <data-vlan-id>\nname <data-name>\nvlan <voice-vlan-id>\nname <voice-name>",
        check: [["vlan"],["name"]] },
      { id: 2, text: "Configure E0/1, E0/2, E0/3 on both switches for data + voice (IP phones and PCs)", device: "Sw1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan <data>\nswitchport voice vlan <voice>\ninterface Ethernet0/2\nswitchport mode access\nswitchport access vlan <data>\nswitchport voice vlan <voice>\ninterface Ethernet0/3\nswitchport mode access\nswitchport access vlan <data>\nswitchport voice vlan <voice>",
        check: [["switchport mode access"],["switchport access vlan"],["switchport voice vlan"]] },
      { id: 3, text: "Enable LLDP (vendor-neutral) on E0/0 of both Sw1 and Sw2", device: "Sw1",
        hint: "interface Ethernet0/0\nlldp transmit\nlldp receive\n\n! or globally: lldp run",
        check: [["lldp"]] }
    ]
  },
  {
    id: 18, title: "Trunking & LACP with Allowed VLANs", category: "Switching",
    source: "Q270-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-3──(E0/2)SW-1(E0/0,E0/1)══Po══(E0/0,E0/1)SW-2──SW-4\n       VLANs 1,12,22`,
    tasks: [
      { id: 1, text: "Configure SW-1 and SW-2 E0/0+E0/1 as 802.1q trunks, permit only VLANs 1, 12, and 22", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 1,12,22\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 1,12,22",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","1","12","22"]] },
      { id: 2, text: "Configure SW-1 E0/2 as 802.1q trunk with only VLANs 12 and 22", device: "SW-1",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 12,22",
        check: [["switchport trunk allowed vlan","12","22"]] },
      { id: 3, text: "Configure LACP on SW-1 and SW-2 E0/0+E0/1: both sides active (immediately negotiate)", device: "SW-1",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-2 same: channel-group 1 mode active",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 19, title: "NAT Pool, DHCP, NTP & SSH", category: "IP Services",
    source: "Q272-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.1.1.1/24", status: "up" }, "Ethernet0/2": { ip: "10.1.2.1/24", status: "up" }, "Loopback0": { ip: "192.168.100.1/24", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.1.1.2/24", status: "up" }, "Ethernet0/1": { ip: "10.1.3.1/24", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/1": { ip: "10.1.3.3/24", status: "up" }, "Ethernet0/2": { ip: "dhcp", status: "up" } } }
    ],
    topology: `R1(Lo0:192.168.100.1) ── R2 ── R3\n  10.1.1.0/24      10.1.3.0/24`,
    tasks: [
      { id: 1, text: "Configure dynamic 1-to-1 NAT on R2: ACL XLATE permits R3 subnet, pool test_pool uses 10.10.10.0/24. Mark inside/outside interfaces.", device: "R2",
        hint: "ip nat pool test_pool 10.10.10.1 10.10.10.254 netmask 255.255.255.0\nip nat inside source list XLATE pool test_pool\nip access-list standard XLATE\npermit 10.1.3.0 0.0.0.255\ninterface Ethernet0/1\nip nat inside\ninterface Ethernet0/0\nip nat outside",
        check: [["ip nat pool","test_pool","10.10.10"],["ip nat inside source list","xlate","pool","test_pool"],["ip access-list standard","xlate"],["permit","10.1.3.0","0.0.0.255"],["ip nat inside"],["ip nat outside"]] },
      { id: 2, text: "Configure R3 E0/2 to receive IP via DHCP", device: "R3",
        hint: "interface Ethernet0/2\nip address dhcp\nno shutdown",
        check: [["ip address dhcp"]] },
      { id: 3, text: "Configure R1 as NTP master, R2 as NTP client using R1 IP 10.1.2.1", device: "R1",
        hint: "ntp master\n\n! On R2:\nntp server 10.1.2.1",
        check: [["ntp master"]] },
      { id: 4, text: "Configure SSH on R3: user root/s3cret, RSA keys, SSH only on VTY lines", device: "R3",
        hint: "username root secret s3cret\nip domain-name lab.local\ncrypto key generate rsa\n1024\nline vty 0 4\ntransport input ssh\nlogin local",
        check: [["username","root"],["crypto key generate rsa"],["transport input ssh"],["login local"]] }
    ]
  },
  {
    id: 20, title: "VLAN, Access Ports & CDP", category: "Switching",
    source: "Q272-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-1(E0/1)──PC1  SW-2(E0/1)──PC2  SW-3(E0/1)──PC3\n VLAN 99 FINANCIAL on all switches`,
    tasks: [
      { id: 1, text: "Configure VLAN 99 named FINANCIAL on all three switches", device: "SW-1",
        hint: "vlan 99\nname FINANCIAL\n\n! Same on SW-2 and SW-3",
        check: [["vlan","99"],["name","financial"]] },
      { id: 2, text: "Configure E0/1 as access port for VLAN 99 on all switches (PC ports)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 99",
        check: [["switchport mode access"],["switchport access vlan","99"]] },
      { id: 3, text: "Re-enable CDP globally on SW-1 (it was disabled)", device: "SW-1",
        hint: "cdp run",
        check: [["cdp run"]] },
      { id: 4, text: "Disable CDP on SW-1 E0/1 so PC1 cannot discover SW-1", device: "SW-1",
        hint: "interface Ethernet0/1\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 21, title: "User Account, ACL & DAI", category: "Security",
    source: "Q274",
    devices: [
      { name: "Sw3", type: "switch", hostname: "Sw3", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.0.0.1/24", status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `ISP ── R1 ── Sw2 ── Sw3 ── PCs\n               VLAN 5`,
    tasks: [
      { id: 1, text: "Configure local account on Sw3: username tech12, password load1key, MD5, exec privilege. Telnet on VTY 0-4.", device: "Sw3",
        hint: "username tech12 algorithm-type md5 secret load1key\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","tech12"],["secret","load1key"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL ISP_ACL on R1: deny RFC1918 class A (10.0.0.0/8) and class B (172.16.0.0/12), permit all other", device: "R1",
        hint: "ip access-list extended ISP_ACL\ndeny ip 10.0.0.0 0.255.255.255 any\ndeny ip 172.16.0.0 0.15.255.255 any\npermit ip any any",
        check: [["ip access-list extended","isp_acl"],["deny ip","10.0.0.0","0.255.255.255"],["deny ip","172.16.0.0","0.15.255.255"],["permit ip any any"]] },
      { id: 3, text: "Configure DAI on Sw2: VLAN 5, validate dst-mac, src-mac, and IP", device: "Sw2",
        hint: "ip arp inspection vlan 5\nip arp inspection validate dst-mac src-mac ip",
        check: [["ip arp inspection vlan","5"],["ip arp inspection validate"]] }
    ]
  },
  {
    id: 22, title: "Trunk + LACP with Native VLAN", category: "Switching",
    source: "Q275",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Sw1(E0/0,E0/1)══Po20══(E0/0,E0/1)Sw2\n PC1(VLAN110)                  PC2(VLAN110)\n Native VLAN 99`,
    tasks: [
      { id: 1, text: "Configure 802.1q trunks on E0/0+E0/1 (both switches), native VLAN 99, allow only VLAN 110 and 99", device: "Sw1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk native vlan 99\nswitchport trunk allowed vlan 99,110\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk native vlan 99\nswitchport trunk allowed vlan 99,110",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk native vlan","99"],["switchport trunk allowed vlan","99","110"]] },
      { id: 2, text: "Configure LACP port-channel 20 on E0/0+E0/1, both sides active (IEEE 802.3ad)", device: "Sw1",
        hint: "interface Ethernet0/0\nchannel-group 20 mode active\ninterface Ethernet0/1\nchannel-group 20 mode active\n\n! Same on Sw2",
        check: [["channel-group","20","mode active"]] }
    ]
  },
  {
    id: 23, title: "VLANs, Access Ports & LLDP", category: "Switching",
    source: "Q276-Sim1",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `Sw1(E0/0)──(E0/0)Sw2\n │E0/1,E0/2,E0/3      │E0/1,E0/2,E0/3\n PCs per VLAN          PCs per VLAN`,
    tasks: [
      { id: 1, text: "Configure VLANs with the naming as indicated in the topology on both Sw1 and Sw2", device: "Sw1",
        hint: "vlan <id>\nname <name>\n! Repeat for each required VLAN",
        check: [["vlan"],["name"]] },
      { id: 2, text: "Assign VLANs to interfaces as access ports (non-trunking, single VLAN per port)", device: "Sw1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan <id>\n! Repeat for E0/2, E0/3",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Enable LLDP (vendor-neutral L2 discovery) on E0/0 of both switches, including native VLAN advertisement", device: "Sw1",
        hint: "lldp run\ninterface Ethernet0/0\nlldp transmit\nlldp receive",
        check: [["lldp"]] }
    ]
  },
  {
    id: 24, title: "OSPF Without Network Statements", category: "Routing",
    source: "Q276-Sim2",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.1/30", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.12.2/30", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.13.3/30", status: "up" } } }
    ],
    topology: `R1 ──E0/0── R2\n │E0/1\n R3\n Area 0, no network statements on R1`,
    tasks: [
      { id: 1, text: "Configure OSPF on R1: process ID 33, router-id from E0/1 IP (10.10.13.1)", device: "R1",
        hint: "router ospf 33\nrouter-id 10.10.13.1",
        check: [["router ospf","33"],["router-id","10.10.13.1"]] },
      { id: 2, text: "Enable OSPF on R1 interfaces using 'ip ospf <pid> area 0' (no network statements). Set priority 255 for DR.", device: "R1",
        hint: "interface Ethernet0/0\nip ospf 33 area 0\nip ospf priority 255\ninterface Ethernet0/1\nip ospf 33 area 0\nip ospf priority 255",
        check: [["ip ospf 33 area 0"],["ip ospf priority","255"]] }
    ]
  },
  {
    id: 25, title: "IPv4/IPv6 Addressing", category: "IP Services",
    source: "QLab212-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/1": { status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1(E0/1) ──── (E0/1)R2\n IPv4: 192.168.180.16/28 (2nd /28)\n IPv6: 2001:db8:acca::/64 (1st /64)`,
    tasks: [
      { id: 1, text: "Configure R1 E0/1 with first usable IP from 2nd /28 subnet (192.168.180.16/28 → 192.168.180.17)", device: "R1",
        hint: "interface Ethernet0/1\nip address 192.168.180.17 255.255.255.240\nno shutdown",
        check: [["ip address","192.168.180.17","255.255.255.240"]] },
      { id: 2, text: "Configure R2 E0/1 with last usable IP from 2nd /28 subnet (192.168.180.30)", device: "R2",
        hint: "interface Ethernet0/1\nip address 192.168.180.30 255.255.255.240\nno shutdown",
        check: [["ip address","192.168.180.30","255.255.255.240"]] },
      { id: 3, text: "Configure IPv6 on R1 and R2 E0/1 using 2001:db8:acca::/64 with addresses from topology", device: "R1",
        hint: "interface Ethernet0/1\nipv6 address 2001:db8:acca::1/64\nno shutdown\n\n! On R2:\nipv6 address 2001:db8:acca::2/64",
        check: [["ipv6 address","2001:db8:acca"]] }
    ]
  },
  {
    id: 26, title: "VLANs, Trunks & VTP", category: "Switching",
    source: "QLab212-Sim2",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw3", type: "switch", hostname: "Sw3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `PC1(VLAN202)──Sw1(E0/2)──(E0/2)Sw2(E0/3)──(E0/3)Sw3──PC3(VLAN303)\n                  │E0/0                │E0/1\n                 PC2(VLAN202)         PC4(VLAN303)`,
    tasks: [
      { id: 1, text: "Configure VLAN 202 (MARKETING) and VLAN 303 (FINANCE) on designated switches. Assign access ports to PC interfaces.", device: "Sw1",
        hint: "! On Sw1:\nvlan 202\nname MARKETING\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 202\ninterface Ethernet0/1\nswitchport mode access\nswitchport access vlan 202\n\n! On Sw3:\nvlan 303\nname FINANCE\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 303\ninterface Ethernet0/1\nswitchport mode access\nswitchport access vlan 303",
        check: [["vlan","202"],["name","marketing"],["switchport mode access"],["switchport access vlan","202"]] },
      { id: 2, text: "Configure E0/2 on Sw1 and Sw2 as 802.1q trunks allowing only VLANs 202 and 303", device: "Sw1",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 202,303",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","202","303"]] },
      { id: 3, text: "Configure E0/3 on Sw2 and Sw3 as 802.1q trunks allowing only VLANs 202 and 303", device: "Sw2",
        hint: "interface Ethernet0/3\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 202,303",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","202","303"]] }
    ]
  },
  {
    id: 27, title: "User Account, ACL & Port Security", category: "Security",
    source: "QLab212-Sim3",
    devices: [
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "Sw102", type: "switch", hostname: "Sw102", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `PC1 ── Sw101 ── Sw102(E0/0) ── PC2\n       VLAN 100/200`,
    tasks: [
      { id: 1, text: "Configure local account on Sw101: username support, password max2learn, exec privilege. Telnet on VTY 0-4.", device: "Sw101",
        hint: "username support secret max2learn\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","support"],["secret","max2learn"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL ENT_ACL on Sw101: deny PC2 ping to PC1, allow PC2 telnet to Sw101, deny other telnet from VLAN200, permit rest", device: "Sw101",
        hint: "ip access-list extended ENT_ACL\ndeny icmp host <PC2-IP> host <PC1-IP>\npermit tcp host <PC2-IP> host <Sw101-IP> eq 23\ndeny tcp any any eq 23\npermit ip any any",
        check: [["ip access-list extended","ent_acl"],["deny icmp"],["permit tcp","eq 23"],["deny tcp","eq 23"],["permit ip any any"]] },
      { id: 3, text: "Configure port security on Sw102 E0/0: max 4 MACs, restrict mode (drop unknown, no shutdown), dynamic learning", device: "Sw102",
        hint: "interface Ethernet0/0\nswitchport port-security\nswitchport port-security maximum 4\nswitchport port-security violation restrict",
        check: [["switchport port-security"],["switchport port-security maximum","4"],["switchport port-security violation restrict"]] }
    ]
  }
];





const LAB_DESCRIPTIONS = {
  1: `IP connectivity and OSPF are preconfigured on all devices where necessary. Do not make any changes to the IP addressing or OSPF. The company policy uses connected interfaces and next hops when configuring static routes except for load balancing or redundancy without floating static. Connectivity must be established between subnet 172.20.20.128/25 on the Internet and the LAN at 192.168.0.0/24 connected to SW1:
1. Configure reachability to the switch SW1 LAN subnet in router R2.
2. Configure default reachability to the Internet subnet in router R1.
3. Configure a single static route in router R2 to reach to the Internet subnet considering both redundant links between routers R1 and R2. A default route is NOT allowed in router R2.
4. Configure a static route in router R1 toward the switch SW1 LAN subnet where the primary link must be through Ethernet0/1, and the backup link must be through Ethernet0/2 using a floating route. Use the minimal administrative distance value when required.`,
  2: `Connectivity between three routers has been established, and IP services must be configured in the order presented to complete the implementation. Tasks assigned include configuration of NAT, NTP, DHCP, and SSH services.
1. All traffic sent from R3 to the R1 Loopback address must be configured for NAT on R2. All source addresses must be translated from R3 to the IP address of Ethernet0/0 on R2, while using only a standard access list named PUBNET. To verify, a ping must be successful to the R1 Loopback address sourced from R3. Do not use NVI NAT configuration.
2. Configure R1 as an NTP server and R2 as a client, not as a peer, using the IP address of the R1 Ethernet0/2 interface. Set the clock on the NTP server for midnight on May 1, 2018.
3. Configure R1 as a DHCP server for the network 10.1.3.0/24 in a pool named NETPOOL. Using a single command, exclude addresses 1 - 10 from the range. Interface Ethernet0/2 on R3 must be issued the IP address of 10.1.3.11 via DHCP.
4. Configure SSH connectivity from R1 to R3, while excluding access via other remote connection protocols. Access for user netadmin and password N3t4ccess must be set on router R3 using RSA and 1024 bits. Verify connectivity using an SSH session from router R1 using a destination address of 10.1.3.11. Do NOT modify console.`,
  3: `All physical cabling between the two switches is installed. Configure the network connectivity between the switches using the designated VLANs and interfaces.
1. Configure VLAN 12 named Compute and VLAN 34 named Telephony where required for each task.
2. Configure Ethernet0/1 on SW2 to use the existing VLAN named Available.
3. Configure the connection between the switches using access ports.
4. Configure Ethernet0/1 on SW1 using data and voice VLANs.
5. Configure Ethernet0/1 on SW2 so that the Cisco proprietary neighbor discovery protocol is turned off for the designated interface only.`,
  4: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.
Task 1
Configure a local account on Gw1 with telnet access only on virtual ports 0-4. Use the following information:
• Username: wheel
• Password: lock3path
• Algorithm type: Scrypt
• Privilege level: Exec mode
Task 2
Configure and apply a NACL on Gw1 to control network traffic from VLAN 10:
• Name: CORP_ACL
• Allow BOOTP and HTTPS
• Restrict all other traffic and log the ingress interface, source MAC address, the packet’s source and destination IP addresses, and ports
Task 3
Configure Sw1:
• Enable DNCP Snooping for VLAN 10
• Disable DHCP Option-82 data insertion
• Enable DHCP Snooping MAC address verification
• Enable trusted interfaces`,
  5: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.
Task 1
Configure a local account on Gw1 with telnet access only on virtual ports 0-4. Use the following information:
• Username: wheel
• Password: lock3path
• Algorithm type: Scrypt
• Privilege level: Exec mode
Task 2
Configure and apply a NACL on Gw1 to control network traffic from VLAN 10:
• Name: CORP_ACL
• Allow BOOTP and HTTPS
• Restrict all other traffic and log the ingress interface, source MAC address, the packet’s source and destination IP addresses, and ports
Task 3
Configure Sw1:
• Enable DNCP Snooping for VLAN 10
• Disable DHCP Option-82 data insertion
• Enable DHCP Snooping MAC address verification
• Enable trusted interfaces`,
  6: `IP connectivity between the three routers is configured. OSPF adjacencies must be established.
1. Configure R1 and R2 Router IDs using the interface IP addresses from the link that is shared between them.
2. Configure the R2 links with a max value facing R1 and R3. R2 must become the DR. R1 and R3 links facing R2 must remain with the default OSPF configuration for DR election. Verify the configuration after clearing the OSPF process.
3. Using a host wildcard mask, configure all three routers to advertise their respective Loopback1 networks.
4. Configure the link between R1 and R3 to disable their ability to add other OSPF routers.`,
  7: `Refer to the topology. All physical cabling is in place. Routers R3 and R4 are fully configured and inaccessible. Configure static routes for various connectivity to the ISP and the LAN, which
resides on R4.
1. Configure a default route on R2 to the ISP
2. Configure a default route on R1 to the ISP
3. Configure R2 with a route to the Server at 10.0.41.10
4. Configure R1 with a route to the LAN that prefers R3 as the primary path to the LAN`,
  8: `R1 and R2 are pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity for PC1 and PC2 must be established to the switches; each port must only allow one VLAN and be operational.
1. Configure SW-1 with VLAN 15 and label it exactly as OPS
2. Configure SW-2 with VLAN 66 and label it exactly as ENGINEERING
3. Configure the switch port connecting to PC1
4. Configure the switch port connecting to PC2
5. Configure the E0/2 connections on SW-1 and SW-2 for neighbor discovery using the vendor-neutral standard protocol and ensure that E0/0 on both switches uses the Cisco proprietary protocol`,
  9: `R1 has been pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity for PC1 and PC2 must be established to the switches, and each port must only allow one VLAN.
1. Configure SW-1 with VLAN 35 and label it exactly as SALES
2. Configure SW-2 with VLAN 39 and label it exactly as MARKETING
3. Configure the switch port connecting to PC1
4. Configure the switch port connecting to PC2
5. Configure SW-1 and SW-2 for universal neighbor discovery using the industry standard protocol and disable it on the interface connecting to PC1`,
  10: `VLANS 35 and 45 have been configured in all three switches. All physical connectivity has been installed and verified All inter-switch links must be operational.
1. Configure SW-1 and SW-2 switch ports e0/0 and e0/1 for 802.1q trunking allowing all VLANS
2. Configure the inter-switch links on SW-1 e0/2, SW-2 e0/2, and SW-3 e0/0 and e0/1 to use native VLAN 35
3. Configure SW-1 and SW-2 switch ports e0/0 and e0/1 for link aggregation SW-1 should immediately negotiate LACP and SW-2 must only respond to LACP requests`,
  11: `All physical cabling is in place and verified. Switch SW-1 is pre-configured and inaccessible. SW-2 and SW-3 ports must be configured and operational to complete the configuration.
1. Configure SW-2 and SW-3 ports E0/0 to use the industry standard encapsulation method for trunking and only tag VLAN 10
2. Configure SW-2 and SW-3 ports E0/0 to send and receive untagged traffic over VLAN 11
3. Configure SW-2 and SW-3 ports E0/2 and E0/3 to use the industry standard encapsulation method for trunking and tag all VLANS
4. Configure SW-2 and SW-3 ports E0/2 and E0/3 for link aggregation using the industry standard protocol with the following requirements:
o SW-2 ports must not initiate the negotiation for the aggregation protocol
o SW-3 ports must immediately negotiate the aggregation protocol
o Use the designated number assignment`,
  12: `All physical cabling is in place and verified. Router R1 is configured and passing traffic for VLANs 5 and 6. All relevant ports are pre-configured as 802.1q trunks.
1. Configure SW-1 port E0/0 to permit only VLANS 5 and 6
2. Configure both SW-1 and SW-2's E0/1 ports to send and receive untagged traffic over VLAN 77
3. Configure SW-2 E0/2 port to permit only VLAN 6
4. Configure both SW-3 and SW-4 ports e0/0 and e0/1 for link aggregation using the industry standard protocol with the following requirements:
o SW-3 ports must immediately negotiate the aggregation protocol
o SW-4 ports must not initiate the negotiation for the aggregation protocol
o Use the designated number assignment`,
  13: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.
1. Configure a local account on Sw103 with telnet access only on virtual ports 0-4. Use the following information:
• Username: devnet
• Password: access8cli
• Algorithm type: SHA256
• Privilege level: Exec mode
2. Using the minimum number of ACEs, modify the existing NACL "INTERNET_ACL" to control network traffic destined for the Internet, and apply the ACL on R1:
• Allow HTTPS from 172.16.0.0/16
• Allow Telnet only for VLAN 101
• Restrict all other traffic and log the ingress interface, source MAC address, the packet's source and destination IP addresses, and ports
3. Configure Sw101:
• Enable DHCP Snooping for VLAN 101
• Disable DHCP Option-82 data insertion
• Enable DHCP Snooping MAC address verification`,
  14: `All physical cabling is in place. A company plans to deploy 64 new sites. The sites will utilize both IPv4 and IPv6 networks.
1. Subnet 10.30.64.0/19 to meet the subnet requirements and maximize the number of hosts
• Using the second subnet
- Assign the first usable IP address to e0/0 on Sw101
- Assign the last usable IP address to e0/0 on Sw102
2. Subnet 2001:db8::/56 to meet the subnet requirements and maximize the number of hosts
• Using the second subnet
- Assign an IPv6 GUA using a unique 64-Bit interface identifier on e0/0 on Sw101
- Assign an IPv6 GUA using a unique 64-Bit interface identifier on e0/0 on Sw102`,
  15: `All physical cabling is in place. Configurations should ensure that connectivity is established end-to-end.
1. Configure a route on R1 to ensure that R1 prefers R2 to reach the 2001:db8:41::/64
network
2. Configure a floating route on R1, and ensure that R1 uses R3 to reach the 2001 :db8:41::/64 network if the connection between R1 and R2 is down
3. Ping and traceroute should be working`,
  16: `R1 has been pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity to the end devices must be configured.
1. Configure SW-1 switch port 0/1 to carry traffic for the Cisco IP phone and PC
2. Configure SW-2 E0/1 to carry traffic for PC2
3. Configure VLAN 10 with the name “Engineering” on SW-1
4. Configure the link between SW-1 and SW-2 to use the vendor neutral neighbor discovery protocol
5. Configure the link on SW-1 to R1 so that it does not allow the Cisco neighbor discovery protocol to pass`,
  17: `All physical cabling is in place and verified. Connectivity for the Switches on ports E0/1, E0/2, and E0/3 must be configured and available for voice and data capabilities.
1. Configure Sw1 and Sw2 with both VLANS, naming them according to the VLAN Name provided in the topology.
2. Configure the E0/1, E0/2, and E0/3 ports on both switches for both VLANS and ensure that Cisco IP phones and PCs pass traffic.
3. Configure Sw1 and Sw2 to allow neighbor discovery via the vendor-neutral protocol on e0/0.`,
  18: `SW-3 and SW-4 are preconfigured with all necessary commands. All physical cabling is in place and verified. All connectivity must be operational.
1. Configure both SW-1 and SW-2 switch ports e0/0 and e0/1 for 802.1q trunking with only VLANS 1, 12, and 22 permitted.
2. Configure SW-1 port e0/2 for 802.1q trunking and include only VLANS 12 and 22.
3. Configure both SW-1 and SW-2 switch ports e0/0 and e0/1 for link aggregation using the industry standard protocol. All ports must be configured so that they immediately negotiate the link.`,
  19: `IP connectivity between the three routers is established. IP Services must be configured in the order presented to complete the implementation.
1. Configure dynamic one-to-one address mapping on R2 using a standard list named XLATE, which allows all traffic to translate the source address of R3 to a pool named test_pool using the 10.10.10.0/24 network for traffic sent from R3 to R1. Avoid using an NVI configuration. Verify reachability by sending a ping to 192.168.100.1 from R3.
2. Configure R3 to dynamically receive an IP address on Ethernet0/2 from the DHCP server.
3. Configure R1 as an NTP server and R2 as a client, not as a peer, using the IP address 10.1.2.1.
4. Configure SSH access from R1 to R3, while excluding access via other remote connection protocols using the user root and password s3cret on router R3 using RSA. Verify connectivity from router R1 to R3 using a destination address assigned to interface E0/2 on R3.`,
  20: `All physical cabling is in place and verified. Connectivity for PC1, PC2 and PC3 must be established to the switches. Each port connecting to the PCs must be configured as an end-user port and only allow the designated VLAN.
1. Configure VLAN 99 on all three switches and label it exactly as FINANCIAL
2. Configure the switch ports connecting to PC1, PC2 and PC3
3. Cisco's neighbor discovery protocol has been disabled on SW-1 and must be re-enabled
4. PC1 must not be able to discover SW-1`,
  21: `Refer to the topology. All physical cabling is in place. Configure local user account, configure a Named ACL (NACL), and Dynamic Arp Inspection.
1. Configure a local account on Sw3 with telnet access only on virtual ports 0-4. Use the following information:
o Username: tech12
o Password: load1key
o Algorithm type: md5
o Privilege level: Exec mode
2. Configure and apply a NACL on R1 to control network traffic towards ISP:
o Name: ISP_ACL
o Restrict RFC 1918 class A and B addresses
o Allow all other addresses
3. A DHCP IP Pool is preconfigured on R1 for VLAN 5, and DHCP Snooping is configured on Sw2. Configure on Sw2:
o Dynamic Arp Inspection for VLAN 5
o Enable validation of the ARP packet destination MAC address
o Enable validation of the ARP packet source MAC address
o Enable validation of the ARP Packet IP address`,
  22: `Task 1
Configure trunks between Sw1 and Sw2 on ports E0/0 and E0/1 using the IEEE standard frame tagging method.
• Add VLAN 99 as untagged on the trunk ports.
• Only extend VLAN 110 and the untagged VLAN across the trunk.
• Verify that PC1 is capable of pinging PC2.
Task 2
On Sw1 and Sw2, use IEEE 802.3ad link aggregation.
• Combine E0/0 and E0/1 into a single logical link while leaving the trunk configurations intact.
• Assign number 20 to the link.
• Both links must negotiate aggregation.`,
  23: `All physical cabling is in place and verified. Connectivity for the Switches on ports E0/1, E0/2, and E0/3 must be configured and available for voice and data capabilities.
1. Configure Sw1 and Sw2 with the VLAN naming as indicated.
2. Assign the VLANs to the appropriate interfaces and set a non-trunking, non-tagged, single-VLAN for each interface according to the topology.
3. Configure both switches to use the L2 vendor-neutral discovery protocol to broadcast device information, including the native VLAN across the e0/0 interfaces.`,
  24: `Refer to the topology. All physical cabling is in place. Routers 2 and 3 are inaccessible. Configure OSPF routing for the network and ensure R1 has joined Area 0 without using network statements.
Task 1
• Configure OSPF on R1 with a process ID and router- ID only as follows:
o use process ID 33
o use EO/1 IP as the router ID
Task 2
• Configure R1 to establish neighbor adjacencies with R2 and R3. The network statement under the OSPF process must not be used.
• Configure R1 to always become the DR for Area 0`,
  25: `Configure IPv4 and IPv6 connectivity between two routers. For IPv4, use a /28 network from the 192.168.180.0/24 private range. For IPv6, use the first /64 subnet from the 2001:0db8:acca::/48 subnet.
1. Using Ethernet0/1 on routers R1 and R2, configure the next usable /28 from the 192.168.180.0/24 range. The network 192.168.180.0/28 is unavailable.
2. For the IPv4 /28 subnet, router R1 must be configured with the first usable host address.
3. For the IPv4 /28 subnet, router R2 must be configured with the last usable host address.
4. For the IPv6 /64 subnet, configure the routers with the IP addressing provided from the topology.
5. A ping must work between the routers on the IPv4 and IPv6 address ranges.`,
  26: `Three switches must be configured for Layer 2 connectivity. The company requires only the designated VLANs to be configured on their respective switches and permitted across any links between switches for security purposes. Do not modify or delete VTP configurations.
The network needs two user-defined VLANs configured:
VLAN 202: MARKETING
VLAN 303: FINANCE
1. Configure the VLANs on the designated switches and assign them as access ports to the interfaces connected to the PCs.
2. Configure the e0/2 interfaces on Sw1 and Sw2 as 802.1q trunks with only the required VLANs permitted.
3. Configure the e0/3 interfaces on Sw2 and Sw3 as 802.1q trunks with only the required VLANs permitted.`,
  27: `Refer to the topology. All physical cabling is in place. Configure a local user account, a Named ACL (NACL), and security.
Task 1
Configure a local account on Sw101 with telnet access only on virtual ports 0-4. Use the following information:
• Username: support
• Password: max2learn
• Privilege level: Exec mode
Task 2
Configure and apply a single NACL on Sw101 using the following:
• Name: ENT_ACL
• Restrict only PC2 on VLAN 200 from pinging PC1
• Allow only PC2 on VLAN 200 to telnet to Sw101
• Prevent all other devices from telnetting from VLAN 200
• Allow all other network traffic from VLAN 200
Task 3
Configure security on interface Ethernet 0/0 of Sw102:
• Set the maximum number of secure MAC addresses to four.
• Drop packets with unknown source addresses until the number of secure MAC addresses drops below the configured maximum value. No notification action is required.
• Allow secure MAC addresses to be learned dynamically.`,
};


const CATEGORIES = [...new Set(LABS.map(l => l.category))];

// ─── CISCO IOS CLI EMULATOR v2 ─────────────────────────────────────────────
function createDeviceState(device) {
  return {
    hostname: device.hostname,
    type: device.type,
    mode: "user",
    currentInterface: null,
    currentLine: null,
    currentRouter: null,
    currentVlan: null,
    currentAcl: null,
    currentDhcpPool: null,
    // Structured running config
    globalCmds: [],
    interfaceCfg: {},
    lineCfg: {},
    routerCfg: {},
    vlanCfg: {},
    aclCfg: {},
    dhcpCfg: {},
    // State
    interfaces: JSON.parse(JSON.stringify(device.interfaces)),
    vlans: { 1: "default" },
    staticRoutes: [],
    staticRoutesV6: [],
    ospfConfig: {},
    users: [],
    natRules: [],
    dhcpExcluded: [],
    dhcpSnooping: { enabled: false, vlans: [], options: {} },
    daiConfig: { vlans: [], validate: [] },
    portSecurity: {},
    cdpGlobal: true,
    lldpGlobal: false,
    ntpConfig: {},
    sshConfigured: false,
    commandHistory: [],
  };
}

function getPrompt(state) {
  const h = state.hostname;
  switch (state.mode) {
    case "user": return `${h}>`;
    case "privileged": return `${h}#`;
    case "config": return `${h}(config)#`;
    case "config-if": return `${h}(config-if)#`;
    case "config-subif": return `${h}(config-subif)#`;
    case "config-line": return `${h}(config-line)#`;
    case "config-router": return `${h}(config-router)#`;
    case "config-vlan": return `${h}(config-vlan)#`;
    case "config-acl": return `${h}(config-std-nacl)#`;
    case "config-ext-acl": return `${h}(config-ext-nacl)#`;
    case "config-dhcp": return `${h}(dhcp-config)#`;
    default: return `${h}#`;
  }
}

// Normalize interface name (handle abbreviations)
function normalizeInterface(input) {
  const map = {
    "e": "Ethernet", "et": "Ethernet", "eth": "Ethernet", "ethernet": "Ethernet",
    "f": "FastEthernet", "fa": "FastEthernet", "fas": "FastEthernet", "fastethernet": "FastEthernet",
    "g": "GigabitEthernet", "gi": "GigabitEthernet", "gig": "GigabitEthernet", "gigabitethernet": "GigabitEthernet",
    "l": "Loopback", "lo": "Loopback", "loop": "Loopback", "loopback": "Loopback",
    "p": "Port-channel", "po": "Port-channel", "port-channel": "Port-channel",
    "s": "Serial", "se": "Serial", "ser": "Serial", "serial": "Serial",
    "v": "Vlan", "vl": "Vlan", "vlan": "Vlan",
  };
  const m = input.match(/^([a-zA-Z-]+)\s*(.*)$/);
  if (!m) return input;
  const prefix = map[m[1].toLowerCase()] || m[1];
  return prefix + m[2].replace(/\s+/g, "");
}

// Parse an interface range like "Ethernet0/2 - 3" → ["Ethernet0/2", "Ethernet0/3"]
function parseInterfaceRange(input) {
  // Handle comma-separated groups: "e0/0, e0/2-3" or "e0/0 - 1, e0/3"
  const groups = input.split(/\s*,\s*/);
  const result = [];
  for (const group of groups) {
    const dashParts = group.split(/\s*-\s*/);
    if (dashParts.length === 2) {
      const base = normalizeInterface(dashParts[0].trim());
      const endNum = dashParts[1].trim();
      const match = base.match(/^(.+\/)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const startNum = parseInt(match[2]);
        const end = parseInt(endNum);
        for (let i = startNum; i <= end; i++) result.push(`${prefix}${i}`);
      } else {
        result.push(base);
      }
    } else {
      result.push(normalizeInterface(group.trim()));
    }
  }
  return result.length ? result : [normalizeInterface(input)];
}

// ─── CONFIG HELPERS: dedup + no-command support ────────────────────────────
function cfgAdd(arr, cmd) {
  const c = cmd.trim().toLowerCase();
  if (!c) return arr;
  // Some cmds replace (ip address, switchport mode, switchport access vlan, etc)
  const replaceKeys = [
    "ip address ", "ipv6 address ", "switchport mode ", "switchport access vlan ",
    "switchport voice vlan ", "switchport trunk native vlan ", "switchport trunk allowed vlan ",
    "switchport trunk encapsulation ", "switchport port-security maximum ",
    "switchport port-security violation ", "ip ospf priority ", "channel-group ",
    "ip ospf ", "router-id ",
  ];
  for (const key of replaceKeys) {
    if (c.startsWith(key)) {
      return [...arr.filter(x => !x.startsWith(key)), c];
    }
  }
  if (arr.includes(c)) return arr; // dedup
  return [...arr, c];
}

function cfgRemove(arr, noCmd) {
  // noCmd is "no switchport mode access" → remove "switchport mode access"
  const positive = noCmd.replace(/^no\s+/, "").trim().toLowerCase();
  if (!positive) return arr;
  // Remove any line that starts with the positive command
  const filtered = arr.filter(x => {
    if (x === positive) return false;
    if (x.startsWith(positive + " ")) return false;
    // Also handle "no shutdown" → remove "shutdown"
    return true;
  });
  // If nothing removed and this is a meaningful no-command, add the no version
  if (filtered.length === arr.length) {
    const c = noCmd.trim().toLowerCase();
    if (arr.includes(c)) return arr;
    return [...arr, c];
  }
  return filtered;
}

function cfgSet(arr, cmd) {
  // For commands where only the no-form is meaningful (like "no cdp enable")
  const c = cmd.trim().toLowerCase();
  if (arr.includes(c)) return arr;
  return [...arr, c];
}

function processCommand(input, state) {
  const rawCmd = input.trim();
  if (!rawCmd) return { output: "", state };

  state = { ...state };
  state.commandHistory = [...state.commandHistory, rawCmd];

  const cmd = rawCmd;
  const lc = cmd.toLowerCase();
  const parts = lc.split(/\s+/);
  const first = parts[0];

  // Universal: ?
  if (rawCmd === "?") return { output: getHelp(state), state };

  // do command (from config modes, run privileged commands)
  if (first === "do" && state.mode.startsWith("config")) {
    const subCmd = rawCmd.substring(3).trim();
    const savedMode = state.mode;
    const savedCtx = { currentInterface: state.currentInterface, currentLine: state.currentLine, currentRouter: state.currentRouter, currentVlan: state.currentVlan, currentAcl: state.currentAcl, currentDhcpPool: state.currentDhcpPool };
    state.mode = "privileged";
    const result = processCommand(subCmd, state);
    result.state.mode = savedMode;
    Object.assign(result.state, savedCtx);
    return result;
  }

  // exit / end
  if (first === "exit" || first === "end") {
    if (first === "end") {
      return { output: "", state: { ...state, mode: state.mode === "user" ? "user" : "privileged", currentInterface: null, currentLine: null, currentRouter: null, currentVlan: null, currentAcl: null, currentDhcpPool: null } };
    }
    const modeUp = {
      "config-if": "config", "config-subif": "config", "config-line": "config",
      "config-router": "config", "config-vlan": "config", "config-acl": "config",
      "config-ext-acl": "config", "config-dhcp": "config",
      "config": "privileged", "privileged": "user",
    };
    const newMode = modeUp[state.mode] || state.mode;
    return { output: "", state: { ...state, mode: newMode, currentInterface: null, currentLine: null, currentRouter: null, currentVlan: null, currentAcl: null, currentDhcpPool: null } };
  }

  // ─── USER EXEC ────
  if (state.mode === "user") {
    if (first === "enable" || first === "en") return { output: "", state: { ...state, mode: "privileged" } };
    if (first === "ping") return doPing(parts, state);
    if (first === "traceroute" || first === "trace") return doTraceroute(parts, state);
    if (first === "show" || first === "sh") return processShow(parts, state);
    return { output: `% Unknown command or computer name, or unable to find computer address`, state };
  }

  // ─── PRIVILEGED EXEC ────
  if (state.mode === "privileged") {
    if (first === "configure" || first === "conf") {
      return { output: "Enter configuration commands, one per line. End with CNTL/Z.", state: { ...state, mode: "config" } };
    }
    if (first === "show" || first === "sh") return processShow(parts, state);
    if (first === "ping") return doPing(parts, state);
    if (first === "traceroute" || first === "trace") return doTraceroute(parts, state);
    if (first === "ssh") {
      const target = parts.slice(1).join(" ");
      return { output: `Password: \n\n[Connection to ${target} opened]\n${state.hostname}>`, state };
    }
    if (first === "copy") return { output: `[OK]\n${parts.slice(1).join(" ")} copied`, state };
    if (first === "write" || (first === "wr")) return { output: "Building configuration...\n[OK]", state };
    if (first === "clear") return { output: "", state };
    if (first === "terminal") return { output: "", state };
    if (first === "clock" && parts[1] === "set") {
      return { output: "", state };
    }
    if (first === "crypto" && parts[1] === "key") {
      state.sshConfigured = true;
      const bits = parts.find(p => /^\d{3,4}$/.test(p)) || "1024";
      return {
        output: `The name for the keys will be: ${state.hostname}.lab.local\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\nHow many bits in the modulus [512]: ${bits}\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)`,
        state
      };
    }
    if (first === "undebug" || first === "debug") return { output: first === "debug" ? "Debugging enabled" : "All possible debugging has been turned off", state };
    if (first === "reload") return { output: "Proceed with reload? [confirm]\n\nSystem Bootstrap, Version 15.1(4)M4\n...\nSystem restarted", state };
    return { output: `% Unknown command '${first}'. Type '?' for help.`, state };
  }

  // ─── GLOBAL CONFIG ────
  if (state.mode === "config") {
    const isNo = first === "no";
    const positiveParts = isNo ? parts.slice(1) : parts;
    const positiveCmd = isNo ? lc.replace(/^no\s+/, "") : lc;
    const pFirst = positiveParts[0];

    // ─── Incomplete command detection ───
    if (!isNo) {
      const incompletes = ["ip route", "ip address", "ip nat", "ip dhcp", "ipv6 route", "switchport", "channel-group"];
      for (const ic of incompletes) {
        if (lc === ic) return { output: "% Incomplete command.", state };
      }
    }

    // ─── Spanning-tree global commands ───
    if (pFirst === "spanning-tree") {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }

    // Interface
    if ((pFirst === "interface" || pFirst === "int") && !isNo) {
      const rest = rawCmd.replace(/^(interface|int)\s+/i, "");
      if (rest.toLowerCase().startsWith("range ")) {
        const rangeStr = rest.replace(/^range\s+/i, "");
        const interfaces = parseInterfaceRange(rangeStr);
        const ifName = interfaces[0];
        if (!state.interfaceCfg[ifName]) state.interfaceCfg[ifName] = [];
        return { output: "", state: { ...state, mode: "config-if", currentInterface: ifName, _rangeInterfaces: interfaces } };
      }
      const ifName = normalizeInterface(rest);
      if (!state.interfaceCfg[ifName]) state.interfaceCfg[ifName] = [];
      return { output: "", state: { ...state, mode: "config-if", currentInterface: ifName } };
    }
    // no interface → remove interface config
    if (isNo && (pFirst === "interface" || pFirst === "int")) {
      const rest = positiveCmd.replace(/^(interface|int)\s+/i, "");
      const ifName = normalizeInterface(rest);
      const newCfg = { ...state.interfaceCfg };
      delete newCfg[ifName];
      return { output: "", state: { ...state, interfaceCfg: newCfg } };
    }
    // Line
    if (pFirst === "line" && !isNo) {
      const lineName = positiveParts.slice(1).join(" ");
      if (!state.lineCfg[lineName]) state.lineCfg[lineName] = [];
      return { output: "", state: { ...state, mode: "config-line", currentLine: lineName } };
    }
    // Router
    if (pFirst === "router" && !isNo) {
      const routerName = positiveParts.slice(1).join(" ");
      if (!state.routerCfg[routerName]) state.routerCfg[routerName] = [];
      return { output: "", state: { ...state, mode: "config-router", currentRouter: routerName } };
    }
    // no router → remove router config
    if (isNo && pFirst === "router") {
      const routerName = positiveParts.slice(1).join(" ");
      const newCfg = { ...state.routerCfg };
      delete newCfg[routerName];
      return { output: "", state: { ...state, routerCfg: newCfg } };
    }
    // VLAN
    if (pFirst === "vlan" && !isNo) {
      const vid = positiveParts[1];
      return { output: "", state: { ...state, mode: "config-vlan", currentVlan: vid, vlans: { ...state.vlans, [vid]: state.vlans[vid] || "" } } };
    }
    // no vlan → delete vlan
    if (isNo && pFirst === "vlan") {
      const vid = positiveParts[1];
      const newVlans = { ...state.vlans }; delete newVlans[vid];
      const newVlanCfg = { ...state.vlanCfg }; delete newVlanCfg[vid];
      return { output: "", state: { ...state, vlans: newVlans, vlanCfg: newVlanCfg } };
    }
    // Named ACL
    if (pFirst === "ip" && positiveParts[1] === "access-list" && !isNo) {
      const isExtended = positiveParts[2] === "extended";
      const isStandard = positiveParts[2] === "standard";
      const aclName = (isExtended || isStandard) ? positiveParts.slice(3).join(" ") : positiveParts.slice(2).join(" ");
      if (!state.aclCfg[aclName]) state.aclCfg[aclName] = [];
      state.globalCmds = cfgAdd(state.globalCmds, positiveCmd);
      return { output: "", state: { ...state, mode: isExtended ? "config-ext-acl" : "config-acl", currentAcl: aclName } };
    }
    // no ip access-list → remove ACL
    if (isNo && pFirst === "ip" && positiveParts[1] === "access-list") {
      const isExt = positiveParts[2] === "extended";
      const isStd = positiveParts[2] === "standard";
      const aclName = (isExt || isStd) ? positiveParts.slice(3).join(" ") : positiveParts.slice(2).join(" ");
      const newAcl = { ...state.aclCfg }; delete newAcl[aclName];
      state.globalCmds = cfgRemove(state.globalCmds, lc);
      return { output: "", state: { ...state, aclCfg: newAcl, globalCmds: state.globalCmds } };
    }
    // DHCP pool
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "pool" && !isNo) {
      const poolName = positiveParts.slice(3).join(" ");
      if (!state.dhcpCfg[poolName]) state.dhcpCfg[poolName] = [];
      return { output: "", state: { ...state, mode: "config-dhcp", currentDhcpPool: poolName } };
    }
    // DHCP excluded
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "excluded-address") {
      if (isNo) {
        state.dhcpExcluded = state.dhcpExcluded.filter(x => x !== positiveCmd);
        state.globalCmds = cfgRemove(state.globalCmds, lc);
      } else {
        state.dhcpExcluded = cfgAdd(state.dhcpExcluded, lc);
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // DHCP snooping
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "snooping") {
      if (isNo) {
        state.dhcpSnooping = { ...state.dhcpSnooping, options: { ...state.dhcpSnooping.options, [positiveParts.slice(3).join(" ")]: false } };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else if (positiveParts.length === 3) {
        state.dhcpSnooping = { ...state.dhcpSnooping, enabled: true };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else if (positiveParts[3] === "vlan") {
        const vid = positiveParts[4];
        if (!state.dhcpSnooping.vlans.includes(vid)) {
          state.dhcpSnooping = { ...state.dhcpSnooping, vlans: [...state.dhcpSnooping.vlans, vid] };
        }
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else {
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // DAI
    if (pFirst === "ip" && positiveParts[1] === "arp" && positiveParts[2] === "inspection") {
      if (positiveParts[3] === "vlan") {
        const vid = positiveParts[4];
        if (isNo) {
          state.daiConfig = { ...state.daiConfig, vlans: state.daiConfig.vlans.filter(v => v !== vid) };
        } else if (!state.daiConfig.vlans.includes(vid)) {
          state.daiConfig = { ...state.daiConfig, vlans: [...state.daiConfig.vlans, vid] };
        }
      } else if (positiveParts[3] === "validate") {
        state.daiConfig = { ...state.daiConfig, validate: isNo ? [] : positiveParts.slice(4) };
      }
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, lc) : cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // Static route IPv4: "ip route" / "no ip route"
    if (pFirst === "ip" && positiveParts[1] === "route") {
      if (isNo) {
        state.staticRoutes = state.staticRoutes.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
        return { output: "", state };
      }
      state.staticRoutes = cfgAdd(state.staticRoutes, lc);
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // Static route IPv6
    if (pFirst === "ipv6" && positiveParts[1] === "route") {
      if (isNo) {
        state.staticRoutesV6 = state.staticRoutesV6.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
        return { output: "", state };
      }
      state.staticRoutesV6 = cfgAdd(state.staticRoutesV6, lc);
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // NAT
    if (pFirst === "ip" && positiveParts[1] === "nat") {
      if (isNo) {
        state.natRules = state.natRules.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
      } else {
        state.natRules = cfgAdd(state.natRules, lc);
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // Username
    if (pFirst === "username") {
      const username = positiveParts[1];
      if (isNo) {
        state.users = state.users.filter(u => u.username !== username);
        state.globalCmds = state.globalCmds.filter(c => !(c.startsWith("username " + username)));
      } else {
        // Replace existing user or add new
        state.users = [...state.users.filter(u => u.username !== username), { cmd: lc, username }];
        state.globalCmds = [...state.globalCmds.filter(c => !(c.startsWith("username " + username))), lc];
      }
      return { output: "", state };
    }
    // Hostname
    if (pFirst === "hostname" && !isNo) {
      const newName = rawCmd.split(/\s+/)[1] || state.hostname;
      state.hostname = newName;
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // Crypto key
    if (pFirst === "crypto" && positiveParts[1] === "key" && !isNo) {
      state.sshConfigured = true;
      const bits = parts.find(p => /^\d{3,4}$/.test(p)) || "1024";
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return {
        output: `The name for the keys will be: ${state.hostname}.lab.local\n% Generating ${bits} bit RSA keys...\n[OK]`,
        state
      };
    }
    // NTP
    if (pFirst === "ntp") {
      if (isNo) {
        const key = positiveParts.slice(1).join(" ");
        const newNtp = { ...state.ntpConfig }; delete newNtp[key];
        state.ntpConfig = newNtp;
        state.globalCmds = state.globalCmds.filter(c => c !== positiveCmd);
      } else {
        state.ntpConfig = { ...state.ntpConfig, [parts.slice(1).join(" ")]: true };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // CDP global
    if ((pFirst === "cdp" && positiveParts[1] === "run") || (isNo && pFirst === "cdp" && positiveParts[1] === "run")) {
      state.cdpGlobal = !isNo;
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, "cdp run") : cfgAdd(state.globalCmds, "cdp run");
      state.globalCmds = state.globalCmds.filter(c => c !== "no cdp run");
      if (isNo) state.globalCmds = cfgAdd(state.globalCmds, "no cdp run");
      return { output: "", state };
    }
    // LLDP global
    if (pFirst === "lldp" && positiveParts[1] === "run") {
      state.lldpGlobal = !isNo;
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, "lldp run") : cfgAdd(state.globalCmds, "lldp run");
      return { output: "", state };
    }
    // ip domain-name (for SSH)
    if (pFirst === "ip" && positiveParts[1] === "domain-name") {
      if (isNo) {
        state.globalCmds = state.globalCmds.filter(c => !c.startsWith("ip domain-name"));
      } else {
        state.globalCmds = [...state.globalCmds.filter(c => !c.startsWith("ip domain-name")), lc];
      }
      return { output: "", state };
    }
    // ipv6 unicast-routing and others
    if (pFirst === "ipv6") {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }
    // ─── Known global config prefixes (accept + store) ───
    const knownGlobalPrefixes = [
      "service ", "no service ", "boot ", "logging ", "enable ", "banner ",
      "ip domain", "ip name", "ip ssh", "ip default", "ip classless",
      "ip cef", "no ip domain", "ip http", "no ip http",
      "access-list ", "ip access-group",
      "snmp", "aaa ", "tacacs", "radius",
    ];
    const matchesKnown = knownGlobalPrefixes.some(p => lc.startsWith(p));
    if (matchesKnown) {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }
    // Generic no command for known prefixes
    if (isNo) {
      // Check if the positive form exists in config
      const posCmd = lc.replace(/^no\s+/, "");
      const existed = state.globalCmds.some(c => c.startsWith(posCmd.split(/\s+/)[0]));
      if (existed) {
        state.globalCmds = cfgRemove(state.globalCmds, lc);
        return { output: "", state };
      }
      // Still allow "no" for known command families
      state.globalCmds = cfgRemove(state.globalCmds, lc);
      return { output: "", state };
    }
    // ─── REJECT unknown commands ───
    return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
  }

  // ─── INTERFACE CONFIG ────
  if (state.mode === "config-if" || state.mode === "config-subif") {
    const iface = state.currentInterface;
    const rangeIfs = state._rangeInterfaces || [iface];
    const isNo = first === "no";
    const positiveCmd = isNo ? lc.replace(/^no\s+/, "") : lc;
    const positiveParts = isNo ? parts.slice(1) : parts;
    const pFirst = positiveParts[0];

    // ─── Incomplete command detection ───
    if (!isNo) {
      const incompletes = ["switchport mode", "switchport access", "switchport trunk", "switchport voice",
        "ip address", "ipv6 address", "channel-group", "switchport port-security maximum",
        "switchport port-security violation"];
      for (const ic of incompletes) {
        if (lc === ic) return { output: "% Incomplete command.", state };
      }
    }

    // Navigate to another interface
    if ((first === "interface" || first === "int") && !isNo) {
      const rest = rawCmd.replace(/^(interface|int)\s+/i, "");
      const newIf = normalizeInterface(rest);
      if (!state.interfaceCfg[newIf]) state.interfaceCfg[newIf] = [];
      return { output: "", state: { ...state, mode: "config-if", currentInterface: newIf, _rangeInterfaces: undefined } };
    }

    // ─── VALIDATE command before storing ───
    const validIfPrefixes = [
      "switchport ", "ip address", "ip nat ", "ip ospf", "ip dhcp", "ip access-group",
      "ip helper-address", "ip proxy-arp",
      "ipv6 address", "ipv6 ospf", "ipv6 nd", "ipv6 enable",
      "shutdown", "no shutdown", "no switchport", "no ip", "no ipv6", "no spanning",
      "no cdp", "no lldp", "no channel",
      "channel-group ", "spanning-tree ", "cdp ", "lldp ", "description ",
      "speed ", "duplex ", "media-type ", "negotiation ",
      "ip arp inspection", "storm-control ",
    ];
    const isValid = isNo || validIfPrefixes.some(p => lc.startsWith(p)) || lc === "shutdown";
    if (!isValid) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }

    // ─── Apply validated command to config ───
    const newIfCfg = { ...state.interfaceCfg };
    for (const ifn of rangeIfs) {
      if (!newIfCfg[ifn]) newIfCfg[ifn] = [];
      if (isNo) {
        newIfCfg[ifn] = cfgRemove(newIfCfg[ifn], lc);
      } else {
        newIfCfg[ifn] = cfgAdd(newIfCfg[ifn], lc);
      }
    }

    // Track specific state changes
    if (pFirst === "ip" && positiveParts[1] === "address") {
      const newIfs = { ...state.interfaces };
      if (isNo) {
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ip: undefined }; }
      } else {
        const addr = parts.slice(2).join(" ");
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ip: addr, status: "up" }; }
      }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (pFirst === "ipv6" && positiveParts[1] === "address") {
      const newIfs = { ...state.interfaces };
      if (isNo) {
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ipv6: undefined }; }
      } else {
        const addr = parts.slice(2).join(" ");
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ipv6: addr, status: "up" }; }
      }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (lc === "no shutdown") {
      const newIfs = { ...state.interfaces };
      for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], status: "up" }; }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (lc === "shutdown") {
      const newIfs = { ...state.interfaces };
      for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], status: "administratively down" }; }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    // Port security
    if (positiveCmd.includes("port-security")) {
      const newPS = { ...state.portSecurity };
      for (const ifn of rangeIfs) {
        if (!newPS[ifn]) newPS[ifn] = {};
        if (isNo) {
          if (positiveCmd === "switchport port-security") newPS[ifn].enabled = false;
          if (positiveParts.includes("maximum")) delete newPS[ifn].max;
          if (positiveParts.includes("violation")) delete newPS[ifn].violation;
        } else {
          if (positiveParts.includes("maximum")) newPS[ifn].max = positiveParts[positiveParts.indexOf("maximum") + 1];
          if (positiveParts.includes("violation")) newPS[ifn].violation = positiveParts[positiveParts.indexOf("violation") + 1];
          if (lc === "switchport port-security") newPS[ifn].enabled = true;
        }
      }
      return { output: "", state: { ...state, portSecurity: newPS, interfaceCfg: newIfCfg } };
    }
    // DHCP snooping trust on interface
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "snooping" && positiveParts[3] === "trust") {
      if (isNo) {
        state.dhcpSnooping = { ...state.dhcpSnooping, trusted: (state.dhcpSnooping.trusted || []).filter(x => x !== iface) };
      } else {
        const trusted = state.dhcpSnooping.trusted || [];
        if (!trusted.includes(iface)) {
          state.dhcpSnooping = { ...state.dhcpSnooping, trusted: [...trusted, iface] };
        }
      }
      return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
    }
    // Channel-group
    if (pFirst === "channel-group") {
      if (isNo) {
        return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
      }
      return { output: `Creating a port-channel interface Port-channel${positiveParts[1]}`, state: { ...state, interfaceCfg: newIfCfg } };
    }
    // All other validated commands (spanning-tree, cdp, lldp, description, etc.)
    return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
  }

  // ─── LINE CONFIG ────
  if (state.mode === "config-line") {
    const line = state.currentLine;
    const validLinePrefixes = [
      "login", "password ", "transport ", "exec-timeout", "logging ",
      "access-class ", "privilege ", "length ", "no ",
    ];
    const isNo = first === "no";
    if (!isNo && !validLinePrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    const newLineCfg = { ...state.lineCfg };
    if (!newLineCfg[line]) newLineCfg[line] = [];
    if (isNo) {
      newLineCfg[line] = cfgRemove(newLineCfg[line], lc);
    } else {
      newLineCfg[line] = cfgAdd(newLineCfg[line], lc);
    }
    return { output: "", state: { ...state, lineCfg: newLineCfg } };
  }

  // ─── ROUTER CONFIG ────
  if (state.mode === "config-router") {
    const router = state.currentRouter;
    const validRtrPrefixes = [
      "network ", "router-id ", "passive-interface", "redistribute ",
      "log-adjacency", "auto-cost", "default-information", "distance ",
      "area ", "no ",
    ];
    const isNo = first === "no";
    if (!isNo && !validRtrPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    const newRtrCfg = { ...state.routerCfg };
    if (!newRtrCfg[router]) newRtrCfg[router] = [];
    const positiveParts = isNo ? parts.slice(1) : parts;
    const pFirst = positiveParts[0];

    if (isNo) {
      newRtrCfg[router] = cfgRemove(newRtrCfg[router], lc);
      if (pFirst === "network") {
        const nets = (state.ospfConfig.networks || []).filter(n => n !== lc.replace(/^no\s+/, ""));
        state.ospfConfig = { ...state.ospfConfig, networks: nets };
      }
    } else {
      newRtrCfg[router] = cfgAdd(newRtrCfg[router], lc);
      if (pFirst === "router-id") {
        newRtrCfg[router] = newRtrCfg[router].filter(c => !c.startsWith("router-id") || c === lc);
        state.ospfConfig = { ...state.ospfConfig, routerId: parts[1] };
      }
      if (pFirst === "network") {
        const nets = state.ospfConfig.networks || [];
        if (!nets.includes(lc)) {
          state.ospfConfig = { ...state.ospfConfig, networks: [...nets, lc] };
        }
      }
    }
    return { output: "", state: { ...state, routerCfg: newRtrCfg } };
  }

  // ─── VLAN CONFIG ────
  if (state.mode === "config-vlan") {
    if (first === "name") {
      const name = rawCmd.replace(/^name\s+/i, "");
      return { output: "", state: { ...state, vlans: { ...state.vlans, [state.currentVlan]: name }, vlanCfg: { ...state.vlanCfg, [state.currentVlan]: name } } };
    }
    if (first === "no") return { output: "", state };
    return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
  }

  // ─── ACL CONFIG ────
  if (state.mode === "config-acl" || state.mode === "config-ext-acl") {
    const acl = state.currentAcl;
    const validAclPrefixes = ["permit ", "deny ", "remark ", "no "];
    if (!validAclPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    const newAclCfg = { ...state.aclCfg };
    if (!newAclCfg[acl]) newAclCfg[acl] = [];
    if (first === "no") {
      newAclCfg[acl] = cfgRemove(newAclCfg[acl], lc);
    } else {
      newAclCfg[acl] = cfgAdd(newAclCfg[acl], lc);
    }
    return { output: "", state: { ...state, aclCfg: newAclCfg } };
  }

  // ─── DHCP POOL CONFIG ────
  if (state.mode === "config-dhcp") {
    const pool = state.currentDhcpPool;
    const validDhcpPrefixes = [
      "network ", "default-router ", "dns-server ", "domain-name ",
      "lease ", "option ", "no ",
    ];
    if (!validDhcpPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    const newDhcpCfg = { ...state.dhcpCfg };
    if (!newDhcpCfg[pool]) newDhcpCfg[pool] = [];
    if (first === "no") {
      newDhcpCfg[pool] = cfgRemove(newDhcpCfg[pool], lc);
    } else {
      newDhcpCfg[pool] = cfgAdd(newDhcpCfg[pool], lc);
    }
    return { output: "", state: { ...state, dhcpCfg: newDhcpCfg } };
  }

  return { output: "", state };
}

function doPing(parts, state) {
  const target = parts[1] || "?";
  if (target === "?") return { output: "  WORD  Ping destination address or hostname", state };
  return {
    output: `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/2/4 ms`,
    state
  };
}

function doTraceroute(parts, state) {
  const target = parts[1] || "?";
  if (target === "?") return { output: "  WORD  Trace route to destination address", state };
  return {
    output: `Type escape sequence to abort.\nTracing the route to ${target}\nVRF info: (vrf in name/id, vrf out name/id)\n  1 ${target} 4 msec 4 msec 4 msec`,
    state
  };
}

// ─── INTERFACE STATE HELPERS ─────────────────────────────────────────────────
function getPortInfo(iface, cmds) {
  const info = { mode: "access", accessVlan: "1", voiceVlan: null, nativeVlan: "1", allowedVlans: "ALL",
    encap: "negotiate", trunk: false, nonegotiate: false, portfast: false, bpduguard: false,
    channelGroup: null, channelMode: null, cdp: null, lldpTx: null, lldpRx: null };
  for (const c of cmds) {
    if (c.startsWith("switchport mode ")) info.mode = c.replace("switchport mode ", "");
    if (c.startsWith("switchport access vlan ")) info.accessVlan = c.replace("switchport access vlan ", "");
    if (c.startsWith("switchport voice vlan ")) info.voiceVlan = c.replace("switchport voice vlan ", "");
    if (c.startsWith("switchport trunk native vlan ")) info.nativeVlan = c.replace("switchport trunk native vlan ", "");
    if (c.startsWith("switchport trunk allowed vlan ")) info.allowedVlans = c.replace("switchport trunk allowed vlan ", "");
    if (c.startsWith("switchport trunk encapsulation ")) info.encap = c.replace("switchport trunk encapsulation ", "");
    if (c === "switchport nonegotiate") info.nonegotiate = true;
    if (c === "spanning-tree portfast") info.portfast = true;
    if (c === "spanning-tree bpduguard enable") info.bpduguard = true;
    if (c.startsWith("channel-group ")) {
      const m = c.match(/channel-group\s+(\d+)\s+mode\s+(\S+)/);
      if (m) { info.channelGroup = m[1]; info.channelMode = m[2]; }
    }
    if (c === "no cdp enable") info.cdp = false;
    if (c === "cdp enable") info.cdp = true;
    if (c === "lldp transmit") info.lldpTx = true;
    if (c === "no lldp transmit") info.lldpTx = false;
    if (c === "lldp receive") info.lldpRx = true;
    if (c === "no lldp receive") info.lldpRx = false;
  }
  info.trunk = info.mode === "trunk";
  return info;
}

function processShow(parts, state) {
  const sub = parts.slice(1).join(" ");

  // show running-config (hierarchical)
  if (sub.startsWith("run") || sub.startsWith("startup")) {
    return { output: buildRunningConfig(state), state };
  }

  // ─── show interfaces trunk ───
  if (sub.startsWith("int") && sub.includes("trunk")) {
    const trunkPorts = [];
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.trunk) trunkPorts.push({ iface, ...pi });
    });
    if (trunkPorts.length === 0) return { output: "% No trunk ports configured", state };
    const lines = [
      "Port        Mode         Encapsulation  Status        Native vlan",
      "----------- ------------ -------------- ------------- -----------",
    ];
    trunkPorts.forEach(p => {
      const enc = p.encap === "dot1q" ? "802.1q" : p.encap;
      lines.push(`${p.iface.padEnd(12)}${"on".padEnd(13)}${enc.padEnd(15)}${"trunking".padEnd(14)}${p.nativeVlan}`);
    });
    lines.push("", "Port        Vlans allowed on trunk", "----------- --------------------------------------");
    trunkPorts.forEach(p => lines.push(`${p.iface.padEnd(12)}${p.allowedVlans}`));
    lines.push("", "Port        Vlans allowed and active in management domain", "----------- --------------------------------------");
    trunkPorts.forEach(p => lines.push(`${p.iface.padEnd(12)}${p.allowedVlans}`));
    return { output: lines.join("\n"), state };
  }

  // ─── show interfaces switchport ───
  if (sub.startsWith("int") && sub.includes("switchport")) {
    const lines = [];
    const target = sub.match(/switchport\s+(\S+)/);
    const ifaces = target ? [[normalizeInterface(target[1]), state.interfaceCfg[normalizeInterface(target[1])] || []]] : Object.entries(state.interfaceCfg);
    ifaces.forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      lines.push(`Name: ${iface}`);
      lines.push(`Switchport: Enabled`);
      lines.push(`Administrative Mode: ${pi.mode === "trunk" ? "trunk" : pi.mode === "access" ? "static access" : "dynamic auto"}`);
      lines.push(`Operational Mode: ${pi.trunk ? "trunk" : "static access"}`);
      lines.push(`Administrative Trunking Encapsulation: ${pi.encap === "dot1q" ? "dot1q" : "negotiate"}`);
      lines.push(`Negotiation of Trunking: ${pi.nonegotiate ? "Off" : "On"}`);
      lines.push(`Access Mode VLAN: ${pi.accessVlan} (${state.vlans[pi.accessVlan] || "VLAN" + pi.accessVlan})`);
      lines.push(`Trunking Native Mode VLAN: ${pi.nativeVlan} (${state.vlans[pi.nativeVlan] || "default"})`);
      if (pi.voiceVlan) lines.push(`Voice VLAN: ${pi.voiceVlan} (${state.vlans[pi.voiceVlan] || "VLAN" + pi.voiceVlan})`);
      lines.push(`Trunking VLANs Allowed: ${pi.allowedVlans}`);
      lines.push(`Pruning VLANs Enabled: 2-1001`);
      lines.push(`Protected: false`);
      lines.push("");
    });
    return { output: lines.join("\n") || "% No switchport interfaces configured", state };
  }

  // ─── show interfaces status ───
  if (sub.startsWith("int") && sub.includes("status")) {
    const lines = [
      "Port      Name               Status       Vlan       Duplex  Speed Type",
      "--------- ------------------ ------------ ---------- ------- ----- ----",
    ];
    Object.entries(state.interfaces).forEach(([iface, info]) => {
      const cmds = state.interfaceCfg[iface] || [];
      const pi = getPortInfo(iface, cmds);
      const status = info.status === "up" ? "connected" : "notconnect";
      const vlanCol = pi.trunk ? "trunk" : pi.accessVlan;
      lines.push(`${iface.padEnd(10)}${"".padEnd(19)}${status.padEnd(13)}${vlanCol.padEnd(11)}${"a-full".padEnd(8)}${"auto".padEnd(6)}10/100/1000BaseTX`);
    });
    return { output: lines.join("\n"), state };
  }

  // ─── show interfaces (detail or specific) ───
  if (sub.startsWith("int") && !sub.startsWith("ip")) {
    const lines = [];
    // Check if specific interface requested
    const ifMatch = sub.match(/^interfaces?\s+(\S+\s*\S*)$/i);
    const targetIfaces = ifMatch
      ? [[normalizeInterface(ifMatch[1].trim()), state.interfaces[normalizeInterface(ifMatch[1].trim())]]]
      : Object.entries(state.interfaces);
    targetIfaces.forEach(([name, info]) => {
      if (!info) { lines.push(`% Invalid input detected at '^' marker.`); return; }
      lines.push(`${name} is ${info.status}, line protocol is ${info.status === "up" ? "up" : "down"}`);
      if (info.ip) lines.push(`  Internet address is ${info.ip}`);
      if (info.ipv6) lines.push(`  IPv6 address is ${info.ipv6}`);
      lines.push(`  MTU 1500 bytes, BW 10000 Kbit/sec, DLY 1000 usec`);
      lines.push(`     reliability 255/255, txload 1/255, rxload 1/255`);
      lines.push(`  Encapsulation ARPA, loopback not set`);
      const cmds = state.interfaceCfg[name] || [];
      const pi = getPortInfo(name, cmds);
      if (pi.trunk) lines.push(`  Switchport mode: trunk, Encapsulation: ${pi.encap}`);
      lines.push(`  Last input 00:00:01, output 00:00:01, output hang never`);
      lines.push(`     0 packets input, 0 bytes, 0 no buffer`);
      lines.push(`     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored`);
      lines.push(`     0 packets output, 0 bytes, 0 underruns`);
      lines.push(`     0 output errors, 0 collisions, 0 interface resets`);
    });
    return { output: lines.join("\n"), state };
  }

  // show ip interface brief
  if (sub.startsWith("ip int") || sub.startsWith("ip interface")) {
    const lines = [
      "Interface                  IP-Address      OK? Method Status                Protocol",
    ];
    Object.entries(state.interfaces).forEach(([name, info]) => {
      const ip = info.ip && info.ip !== "dhcp" ? info.ip.split("/")[0] : (info.ip === "dhcp" ? "DHCP" : "unassigned");
      lines.push(`${name.padEnd(27)}${ip.padEnd(16)}YES manual ${info.status.padEnd(22)}${info.status === "up" ? "up" : "down"}`);
    });
    return { output: lines.join("\n"), state };
  }

  // ─── show vlan brief (with port assignment) ───
  if (sub.startsWith("vlan")) {
    const lines = [
      "VLAN Name                             Status    Ports",
      "---- -------------------------------- --------- -------------------------------",
    ];
    // Build vlan→port mapping
    const vlanPorts = {};
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (!pi.trunk) {
        const vid = pi.accessVlan || "1";
        if (!vlanPorts[vid]) vlanPorts[vid] = [];
        vlanPorts[vid].push(iface);
      }
    });
    // Also add interfaces not in interfaceCfg (default VLAN 1)
    Object.keys(state.interfaces).forEach(iface => {
      if (!state.interfaceCfg[iface] || state.interfaceCfg[iface].length === 0) {
        if (!vlanPorts["1"]) vlanPorts["1"] = [];
        if (!vlanPorts["1"].includes(iface)) vlanPorts["1"].push(iface);
      }
    });
    Object.entries(state.vlans).forEach(([id, name]) => {
      const vname = name || ("VLAN" + id);
      const ports = (vlanPorts[id] || []).join(", ");
      lines.push(`${id.toString().padEnd(5)}${vname.padEnd(33)}active    ${ports}`);
    });
    return { output: lines.join("\n"), state };
  }

  // show ip route
  if (sub.startsWith("ip route") || sub.startsWith("ip ro")) {
    const lines = [
      "Codes: L - local, C - connected, S - static, R - RIP, O - OSPF,",
      "       B - BGP, * - candidate default, E - EIGRP",
      "",
      "Gateway of last resort is not set",
      "",
    ];
    // Connected routes
    Object.entries(state.interfaces).forEach(([name, info]) => {
      if (info.ip && info.ip !== "dhcp" && info.status === "up") {
        const ip = info.ip.split("/")[0];
        const cidr = info.ip.split("/")[1] || "24";
        lines.push(`C    ${ip}/${cidr} is directly connected, ${name}`);
        lines.push(`L    ${ip}/32 is directly connected, ${name}`);
      }
    });
    // Default route check
    const hasDefault = state.staticRoutes.some(r => r.includes("0.0.0.0 0.0.0.0"));
    if (hasDefault) lines[3] = "Gateway of last resort is set";
    // Static routes
    state.staticRoutes.forEach(r => {
      const p = r.replace(/^ip route\s+/, "");
      const isDefault = p.startsWith("0.0.0.0 0.0.0.0");
      lines.push(`S${isDefault ? "*" : " "}   ${p}`);
    });
    if (state.staticRoutes.length === 0 && Object.keys(state.interfaces).every(k => !state.interfaces[k].ip)) {
      lines.push("% No routes found");
    }
    return { output: lines.join("\n"), state };
  }

  // show ipv6 route
  if (sub.startsWith("ipv6 route") || sub.startsWith("ipv6 ro")) {
    const lines = ["IPv6 Routing Table - 0 entries", "Codes: C - Connected, L - Local, S - Static, O - OSPF", ""];
    (state.staticRoutesV6 || []).forEach(r => {
      lines.push(`S    ${r.replace(/^ipv6 route\s+/, "")}`);
    });
    lines[0] = `IPv6 Routing Table - ${(state.staticRoutesV6 || []).length} entries`;
    return { output: lines.join("\n"), state };
  }

  // show ip ospf
  if (sub.startsWith("ip ospf")) {
    const rid = state.ospfConfig.routerId || "0.0.0.0";
    const nets = state.ospfConfig.networks || [];
    // Find process ID from routerCfg
    const ospfProc = Object.keys(state.routerCfg).find(k => k.startsWith("ospf")) || "ospf 1";
    const pid = ospfProc.replace("ospf ", "");
    const lines = [
      `Routing Process "ospf ${pid}" with ID ${rid}`,
      ` Start time: 00:00:01.000, Time elapsed: 00:10:00.000`,
      ` Supports only single TOS(TOS0) routes`,
      ` Supports opaque LSA`,
      ` Number of areas in this router is 1. 1 normal 0 stub 0 nssa`,
      ` Number of areas transit capable is 0`,
      ` Reference bandwidth unit is 100 mbps`,
      ` Number of interfaces in this area: ${nets.length}`,
    ];
    return { output: lines.join("\n"), state };
  }

  // show ip nat translations
  if (sub.startsWith("ip nat")) {
    if (state.natRules.length === 0) return { output: "% No NAT translations active", state };
    const lines = ["Pro  Inside global       Inside local        Outside local       Outside global", "---  ------------------- ------------------- ------------------- -------------------"];
    lines.push("---  ---                 ---                 ---                 ---");
    return { output: lines.join("\n"), state };
  }

  // ─── show cdp neighbors ───
  if (sub.startsWith("cdp") && sub.includes("neigh")) {
    if (!state.cdpGlobal) return { output: "% CDP is not enabled", state };
    const lines = [
      "Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge",
      "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone",
      "",
      "Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID",
    ];
    // Simulated neighbors based on lab topology
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.cdp !== false && (pi.trunk || pi.mode === "access")) {
        lines.push(`Neighbor         ${iface.padEnd(18)}160        R S I       Cisco     Eth0/0`);
      }
    });
    if (lines.length === 4) lines.push("% No CDP neighbors found");
    lines.push("", `Total cdp entries displayed : ${Math.max(0, lines.length - 5)}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show cdp (global) ───
  if (sub.startsWith("cdp")) {
    return {
      output: `Global CDP information:\n  Sending CDP packets every 60 seconds\n  Sending a holdtime value of 180 seconds\n  Sending CDPv2 advertisements is enabled\n  CDP is ${state.cdpGlobal ? "enabled" : "disabled"}`,
      state
    };
  }

  // ─── show lldp neighbors ───
  if (sub.startsWith("lldp") && sub.includes("neigh")) {
    if (!state.lldpGlobal) return { output: "% LLDP is not enabled", state };
    const lines = [
      "Capability codes:",
      "    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device",
      "    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other",
      "",
      "Device ID          Local Intf     Hold-time  Capability      Port ID",
    ];
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.lldpTx !== false && (pi.trunk || pi.mode === "access")) {
        lines.push(`Neighbor           ${iface.padEnd(15)}120        B,R             Eth0/0`);
      }
    });
    if (lines.length === 5) lines.push("% No LLDP neighbors found");
    lines.push("", `Total entries displayed: ${Math.max(0, lines.length - 6)}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show lldp (global) ───
  if (sub.startsWith("lldp")) {
    return {
      output: `Global LLDP Information:\n  Status: ${state.lldpGlobal ? "ACTIVE" : "DISABLED"}\n  LLDP advertisements are sent every 30 seconds\n  LLDP hold time advertised is 120 seconds\n  LLDP reinitializing delay is 2 seconds`,
      state
    };
  }

  // ─── show etherchannel summary ───
  if (sub.includes("etherchannel") || sub.includes("port-channel")) {
    const channels = {};
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.channelGroup) {
        if (!channels[pi.channelGroup]) channels[pi.channelGroup] = { mode: pi.channelMode, members: [] };
        channels[pi.channelGroup].members.push(iface);
      }
    });
    const lines = [
      "Flags:  D - down        P - bundled in port-channel",
      "        I - stand-alone  s - suspended",
      "        H - Hot-standby (LACP only)",
      "        R - Layer3       S - Layer2",
      "        U - in use       f - failed to allocate aggregator",
      "",
      "Number of channel-groups in use: " + Object.keys(channels).length,
      "Number of aggregators:           " + Object.keys(channels).length,
      "",
      "Group  Port-channel  Protocol    Ports",
      "------+-------------+-----------+-----------------------------------------------",
    ];
    Object.entries(channels).forEach(([grp, info]) => {
      const proto = (info.mode === "active" || info.mode === "passive") ? "LACP" : (info.mode === "on" ? "  -" : "PAgP");
      const memberStr = info.members.map(m => `${m}(P)`).join("    ");
      lines.push(`${grp.padEnd(7)}Po${grp.padEnd(12)}${proto.padEnd(12)}${memberStr}`);
    });
    if (Object.keys(channels).length === 0) lines.push("% No EtherChannel configured");
    return { output: lines.join("\n"), state };
  }

  // show port-security
  if (sub.includes("port-security")) {
    const lines = [
      "Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action",
      "----------   -------------  -----------  -----------------  ---------------",
    ];
    Object.entries(state.portSecurity).forEach(([iface, cfg]) => {
      if (cfg.enabled) {
        const maxStr = (cfg.max || "1").toString();
        const violStr = cfg.violation ? cfg.violation.charAt(0).toUpperCase() + cfg.violation.slice(1) : "Shutdown";
        lines.push(`${iface.padEnd(13)}${maxStr.padEnd(15)}0${" ".repeat(12)}0${" ".repeat(18)}${violStr}`);
      }
    });
    if (lines.length === 2) lines.push("% Port security not configured on any interface");
    return { output: lines.join("\n"), state };
  }

  // show ip dhcp snooping
  if (sub.includes("dhcp snooping") || sub.includes("dhcp snoop")) {
    const lines = [
      `Switch DHCP snooping is ${state.dhcpSnooping.enabled ? "enabled" : "disabled"}`,
      `Switch DHCP gleaning is disabled`,
      `DHCP snooping is configured on following VLANs:`,
      `${state.dhcpSnooping.vlans.length ? state.dhcpSnooping.vlans.join(",") : "none"}`,
      `DHCP snooping is operational on following VLANs:`,
      `${state.dhcpSnooping.vlans.length ? state.dhcpSnooping.vlans.join(",") : "none"}`,
      `Insertion of option 82 is ${state.dhcpSnooping.options?.["information option"] === false ? "disabled" : "enabled"}`,
    ];
    const trusted = state.dhcpSnooping.trusted || [];
    if (trusted.length) {
      lines.push("", "Interface                  Trusted    Rate limit (pps)");
      lines.push("-----------------------    -------    ----------------");
      trusted.forEach(t => lines.push(`${t.padEnd(27)}yes        unlimited`));
    }
    return { output: lines.join("\n"), state };
  }

  // show ip arp inspection
  if (sub.includes("arp inspection")) {
    const lines = [
      `Source Mac Validation      : ${state.daiConfig.validate.includes("src-mac") ? "Enabled" : "Disabled"}`,
      `Destination Mac Validation : ${state.daiConfig.validate.includes("dst-mac") ? "Enabled" : "Disabled"}`,
      `IP Address Validation      : ${state.daiConfig.validate.includes("ip") ? "Enabled" : "Disabled"}`,
      ``,
      ` Vlan     Configuration    Operation   ACL Match          Static ACL`,
      ` ----     -------------    ---------   ---------          ----------`,
    ];
    state.daiConfig.vlans.forEach(v => {
      lines.push(` ${v.padEnd(9)}Enabled          Active      N/A                N/A`);
    });
    if (state.daiConfig.vlans.length === 0) lines.push(" No VLANs configured for DAI");
    return { output: lines.join("\n"), state };
  }

  // ─── show mac address-table ───
  if (sub.startsWith("mac") || sub.includes("mac-address") || sub.includes("mac address")) {
    const lines = [
      "          Mac Address Table",
      "-------------------------------------------",
      "",
      "Vlan    Mac Address       Type        Ports",
      "----    -----------       --------    -----",
    ];
    // Generate simulated MAC entries from configured access ports
    let count = 0;
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (!pi.trunk && state.interfaces[iface]?.status === "up") {
        const hash = iface.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const mac = `0050.${(hash & 0xffff).toString(16).padStart(4,"0")}.${((hash*7) & 0xffff).toString(16).padStart(4,"0")}`;
        lines.push(`${pi.accessVlan.padEnd(8)}${mac.padEnd(18)}DYNAMIC     ${iface}`);
        count++;
      }
    });
    lines.push(`Total Mac Addresses for this criterion: ${count}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show spanning-tree ───
  if (sub.startsWith("span")) {
    const lines = [];
    const activeVlans = Object.keys(state.vlans);
    activeVlans.forEach(vid => {
      lines.push(`VLAN${vid.toString().padStart(4, "0")}`);
      lines.push(`  Spanning tree enabled protocol rstp`);
      lines.push(`  Root ID    Priority    32768`);
      lines.push(`             Address     aabb.cc00.0100`);
      lines.push(`             This bridge is the root`);
      lines.push(`             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec`);
      lines.push(``);
      lines.push(`  Bridge ID  Priority    32768  (priority 32768 sys-id-ext ${vid})`);
      lines.push(`             Address     aabb.cc00.0100`);
      lines.push(`             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec`);
      lines.push(`             Aging Time  300 sec`);
      lines.push(``);
      lines.push(`Interface           Role Sts Cost      Prio.Nbr Type`);
      lines.push(`------------------- ---- --- --------- -------- --------------------------------`);
      Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
        const pi = getPortInfo(iface, cmds);
        const pf = pi.portfast ? "Edge " : "";
        lines.push(`${iface.padEnd(20)}Desg FWD 100       128.1    ${pf}P2p`);
      });
      lines.push("");
    });
    if (lines.length === 0) lines.push("No spanning tree instances exist.");
    return { output: lines.join("\n"), state };
  }

  // show ntp
  if (sub.startsWith("ntp")) {
    const entries = Object.keys(state.ntpConfig);
    if (entries.length === 0) return { output: "% NTP is not configured", state };
    const lines = [];
    if (state.ntpConfig.master) lines.push("NTP master stratum 8");
    entries.forEach(e => { if (e !== "master") lines.push(`ntp ${e}`); });
    return { output: lines.join("\n"), state };
  }

  // show ip access-lists
  if (sub.includes("access-list") || sub.includes("access-lists")) {
    const lines = [];
    Object.entries(state.aclCfg).forEach(([name, entries]) => {
      const aclDef = state.globalCmds.find(c => c.includes("access-list") && c.includes(name));
      const type = aclDef && aclDef.includes("extended") ? "Extended" : "Standard";
      lines.push(`${type} IP access list ${name}`);
      entries.forEach((e, i) => lines.push(`    ${(i+1)*10} ${e}`));
    });
    if (lines.length === 0) lines.push("% No access lists configured");
    return { output: lines.join("\n"), state };
  }

  // show ip dhcp pool
  if (sub.includes("dhcp pool") || sub.includes("dhcp bind")) {
    const lines = [];
    Object.entries(state.dhcpCfg).forEach(([name, entries]) => {
      lines.push(`Pool ${name} :`);
      lines.push(` Utilization mark (high/low)    : 100 / 0`);
      entries.forEach(e => lines.push(` ${e}`));
      lines.push("");
    });
    if (lines.length === 0) lines.push("% No DHCP pools configured");
    return { output: lines.join("\n"), state };
  }

  // show version
  if (sub.startsWith("ver")) {
    return {
      output: `Cisco IOS Software, Version 15.9(3)M7\nCopyright (c) by Cisco Systems, Inc.\n\nROM: System Bootstrap, Version 15.1(4)M4\n\n${state.hostname} uptime is 0 minutes\nSystem image file is "flash:c2900-universalk9-mz.SPA.159-3.M7.bin"\n\nCisco ${state.type === "switch" ? "WS-C2960-24TT-L" : "CISCO2901/K9"} (revision 1.0)\n${state.type === "switch" ? "2" : "2"} ${state.type === "switch" ? "FastEthernet/IEEE 802.3" : "Gigabit Ethernet"} interfaces\n256K bytes of non-volatile configuration memory.\n255744K bytes of ATA System CompactFlash 0 (Read/Write)`,
      state
    };
  }

  // show clock
  if (sub.startsWith("clock") || sub.startsWith("cl")) {
    return { output: `*12:00:00.000 UTC Sun Feb 22 2026`, state };
  }

  // ─── show ? (help for show subcommands) ───
  if (sub === "" || sub === "?") {
    const showHelp = [
      ["access-lists", "List access lists"],
      ["arp", "ARP table / DAI"],
      ["cdp", "CDP information"],
      ["clock", "Display the system clock"],
      ["etherchannel", "EtherChannel information"],
      ["interfaces", "Interface status and configuration"],
      ["ip", "IP information"],
      ["lldp", "LLDP information"],
      ["mac", "MAC forwarding table"],
      ["ntp", "NTP information"],
      ["port-security", "Show port security"],
      ["running-config", "Current operating configuration"],
      ["spanning-tree", "Spanning tree topology"],
      ["startup-config", "Saved configuration"],
      ["version", "System hardware and software status"],
      ["vlan", "VTP VLAN status"],
    ];
    return { output: showHelp.map(([c, d]) => `  ${c.padEnd(20)} ${d}`).join("\n"), state };
  }

  return { output: `% Invalid input detected at '^' marker.\n\n  show ${sub}\n       ^`, state };
}

function buildRunningConfig(state) {
  const lines = [
    "Building configuration...",
    "",
    "Current configuration : " + state.hostname,
    "!",
    "version 15.9",
    "service timestamps debug datetime msec",
    "service timestamps log datetime msec",
    "!",
    `hostname ${state.hostname}`,
    "!",
  ];
  // Users
  state.users.forEach(u => lines.push(u.cmd));
  if (state.users.length) lines.push("!");
  // Global commands (filter out items shown in dedicated sections)
  const skipPrefixes = [
    "username", "cdp", "no cdp", "lldp", "no lldp", "ntp",
    "ip route", "ipv6 route", "ip nat", "ip dhcp",
    "ip access-list", "ip arp inspection", "hostname",
  ];
  const displayGlobal = state.globalCmds.filter(c =>
    !skipPrefixes.some(p => c.startsWith(p))
  );
  displayGlobal.forEach(c => lines.push(c));
  if (displayGlobal.length) lines.push("!");
  // LLDP/CDP
  if (state.lldpGlobal) lines.push("lldp run");
  if (!state.cdpGlobal) lines.push("no cdp run");
  // NTP
  Object.keys(state.ntpConfig).forEach(k => lines.push(`ntp ${k}`));
  // DHCP Snooping global
  if (state.dhcpSnooping.enabled) lines.push("ip dhcp snooping");
  state.dhcpSnooping.vlans.forEach(v => lines.push(`ip dhcp snooping vlan ${v}`));
  if (state.dhcpSnooping.options) {
    Object.entries(state.dhcpSnooping.options).forEach(([k, v]) => {
      if (v === false) lines.push(`no ip dhcp snooping ${k}`);
    });
  }
  // DAI
  state.daiConfig.vlans.forEach(v => lines.push(`ip arp inspection vlan ${v}`));
  if (state.daiConfig.validate.length) lines.push(`ip arp inspection validate ${state.daiConfig.validate.join(" ")}`);
  // DHCP Snooping verify
  const snoopVerify = state.globalCmds.filter(c => c.startsWith("ip dhcp snooping verify"));
  snoopVerify.forEach(c => lines.push(c));
  if (state.dhcpSnooping.enabled || state.daiConfig.vlans.length || snoopVerify.length) lines.push("!");
  // ACLs
  Object.entries(state.aclCfg).forEach(([name, entries]) => {
    // Find the original ACL type from globalCmds
    const aclDef = state.globalCmds.find(c => c.includes("access-list") && c.includes(name));
    lines.push(aclDef || `ip access-list extended ${name}`);
    entries.forEach(e => lines.push(` ${e}`));
    lines.push("!");
  });
  // DHCP excluded + pools
  state.dhcpExcluded.forEach(c => lines.push(c));
  Object.entries(state.dhcpCfg).forEach(([name, entries]) => {
    lines.push(`ip dhcp pool ${name}`);
    entries.forEach(e => lines.push(` ${e}`));
    lines.push("!");
  });
  // Static routes
  state.staticRoutes.forEach(r => lines.push(r));
  (state.staticRoutesV6 || []).forEach(r => lines.push(r));
  // NAT
  state.natRules.forEach(r => lines.push(r));
  if (state.staticRoutes.length || (state.staticRoutesV6 || []).length || state.natRules.length) lines.push("!");
  // VLANs
  Object.entries(state.vlanCfg).forEach(([id, name]) => {
    lines.push(`vlan ${id}`);
    if (name) lines.push(` name ${name}`);
    lines.push("!");
  });
  // Interfaces
  Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`interface ${iface}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  // Lines
  Object.entries(state.lineCfg).forEach(([line, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`line ${line}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  // Router
  Object.entries(state.routerCfg).forEach(([router, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`router ${router}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  lines.push("!", "end");
  return lines.join("\n");
}

function getHelp(state) {
  const helps = {
    user: [
      ["enable", "Turn on privileged commands"],
      ["exit", "Exit from the EXEC"],
      ["ping", "Send echo messages"],
      ["show", "Show running system information"],
      ["traceroute", "Trace route to destination"],
    ],
    privileged: [
      ["clear", "Reset functions"],
      ["clock set", "Set the time and date"],
      ["configure terminal", "Enter configuration mode"],
      ["copy", "Copy from one file to another"],
      ["crypto key generate rsa", "Generate RSA keys for SSH"],
      ["debug", "Debugging functions"],
      ["exit", "Exit from the EXEC"],
      ["ping", "Send echo messages"],
      ["reload", "Halt and perform a cold restart"],
      ["show", "Show running system information"],
      ["ssh", "Open a secure shell client connection"],
      ["terminal", "Set terminal line parameters"],
      ["traceroute", "Trace route to destination"],
      ["undebug", "Disable debugging functions"],
      ["write memory", "Save running config to NVRAM"],
    ],
    config: [
      ["cdp run", "Enable CDP"],
      ["crypto key generate rsa", "Generate RSA keys"],
      ["exit", "Exit from configure mode"],
      ["hostname", "Set system's network name"],
      ["interface", "Select an interface to configure"],
      ["ip access-list", "Named access list"],
      ["ip arp inspection", "Dynamic ARP Inspection"],
      ["ip dhcp excluded-address", "Prevent DHCP from assigning certain addresses"],
      ["ip dhcp pool", "Configure DHCP address pool"],
      ["ip dhcp snooping", "DHCP Snooping"],
      ["ip domain-name", "Define the default domain name"],
      ["ip nat", "NAT configuration commands"],
      ["ip route", "Establish static routes"],
      ["ipv6 route", "Establish IPv6 static routes"],
      ["ipv6 unicast-routing", "Enable IPv6 routing"],
      ["line", "Configure a terminal line"],
      ["lldp run", "Enable LLDP"],
      ["no", "Negate a command or set its defaults"],
      ["ntp", "Configure NTP"],
      ["router", "Enable a routing process"],
      ["spanning-tree", "Spanning Tree Subsystem"],
      ["username", "Establish user name authentication"],
      ["vlan", "VLAN commands"],
    ],
    "config-if": [
      ["cdp enable", "Enable CDP on this interface"],
      ["channel-group", "Etherchannel/port bundling"],
      ["description", "Interface specific description"],
      ["exit", "Exit from interface configuration mode"],
      ["ip address", "Set the IP address of an interface"],
      ["ip dhcp snooping trust", "DHCP Snooping trust"],
      ["ip nat inside|outside", "NAT interface designation"],
      ["ip ospf", "OSPF interface commands"],
      ["ipv6 address", "Set the IPv6 address"],
      ["lldp transmit|receive", "LLDP per-interface"],
      ["no", "Negate a command"],
      ["shutdown", "Shutdown the selected interface"],
      ["spanning-tree bpduguard", "Don't accept BPDUs on this interface"],
      ["spanning-tree portfast", "Portfast on this interface"],
      ["switchport access vlan", "Set access mode VLAN"],
      ["switchport mode", "Set interface trunking mode (access|trunk)"],
      ["switchport nonegotiate", "Disable DTP negotiation"],
      ["switchport port-security", "Port security commands"],
      ["switchport trunk", "Trunk configuration"],
      ["switchport voice vlan", "Set voice VLAN"],
    ],
    "config-line": [
      ["exec-timeout", "Set the EXEC timeout"],
      ["exit", "Exit from line configuration mode"],
      ["login local", "Enable login using local database"],
      ["password", "Set a line password"],
      ["transport input", "Define which protocols to use for incoming connections"],
    ],
    "config-router": [
      ["exit", "Exit from router configuration mode"],
      ["log-adjacency-changes", "Log changes in adjacency state"],
      ["network", "Enable routing on an IP network"],
      ["passive-interface", "Suppress routing updates on an interface"],
      ["redistribute", "Redistribute information from another routing protocol"],
      ["router-id", "Router ID for this OSPF process"],
    ],
    "config-vlan": [
      ["exit", "Exit from VLAN configuration mode"],
      ["name", "ASCII name of the VLAN"],
    ],
    "config-acl": [
      ["deny", "Specify packets to reject"],
      ["exit", "Exit from access-list configuration mode"],
      ["permit", "Specify packets to forward"],
      ["remark", "Access list entry comment"],
    ],
    "config-ext-acl": [
      ["deny", "Specify packets to reject"],
      ["exit", "Exit from access-list configuration mode"],
      ["permit", "Specify packets to forward"],
      ["remark", "Access list entry comment"],
    ],
    "config-dhcp": [
      ["default-router", "Default routers"],
      ["dns-server", "DNS servers"],
      ["exit", "Exit from DHCP pool configuration mode"],
      ["network", "Network number and mask"],
    ],
  };
  const entries = helps[state.mode] || [["?", "Show help"]];
  return entries.map(([cmd, desc]) => `  ${cmd.padEnd(30)} ${desc}`).join("\n");
}

// ─── TASK VERIFICATION ENGINE ───────────────────────────────────────────────
function checkTaskCompletion(task, deviceStates) {
  const ds = deviceStates[task.device];
  if (!ds || !task.check) return false;

  // Collect ALL current config commands on this device (lowercased, no dupes)
  const allCmds = new Set();
  // Global commands
  ds.globalCmds.forEach(c => allCmds.add(c));
  // Interface config
  Object.values(ds.interfaceCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Line config
  Object.values(ds.lineCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Router config
  Object.values(ds.routerCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // ACL config
  Object.values(ds.aclCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // DHCP config
  Object.values(ds.dhcpCfg).forEach(arr => arr.forEach(c => allCmds.add(c)));
  // Static routes
  ds.staticRoutes.forEach(c => allCmds.add(c));
  (ds.staticRoutesV6 || []).forEach(c => allCmds.add(c));
  // NAT rules
  ds.natRules.forEach(c => allCmds.add(c));
  // DHCP excluded
  ds.dhcpExcluded.forEach(c => allCmds.add(c));

  const cmdArr = Array.from(allCmds);

  // For each required check pattern, find if any current command matches ALL keywords
  for (const keywords of task.check) {
    const found = cmdArr.some(cmd => {
      return keywords.every(kw => cmd.includes(kw.toLowerCase()));
    });
    if (!found) return false;
  }
  return true;
}

function getTaskResults(lab, deviceStates) {
  if (!lab) return {};
  const results = {};
  lab.tasks.forEach(task => {
    const key = task.id;
    results[key] = checkTaskCompletion(task, deviceStates);
  });
  return results;
}


// ─── THEME CONFIG ────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0a0e17", bgAlt: "#0d1117", card: "#111820",
    border: "#1e2a3a", borderAccent: "#1a8870",
    text: "#e0e6ed", textMuted: "#6b7b8d", textDim: "#8b9bb4",
    accent: "#00d4aa", accentAlt: "#0891b2",
    routerBg: "#1a3a2a", routerText: "#4ade80", routerBorder: "#2a5a3a",
    switchBg: "#1a2a3a", switchText: "#60a5fa", switchBorder: "#2a3a5a",
    warn: "#f59e0b", headerGrad: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)",
    catBg: "#0891b215", accentBg: "#00d4aa15",
    hintBg: "#0a0e17",
    successBg: "#052e16", successBorder: "#16a34a", successText: "#4ade80",
  },
  light: {
    bg: "#f3f4f6", bgAlt: "#ffffff", card: "#ffffff",
    border: "#d1d5db", borderAccent: "#10b981",
    text: "#1f2937", textMuted: "#6b7280", textDim: "#4b5563",
    accent: "#059669", accentAlt: "#0284c7",
    routerBg: "#dcfce7", routerText: "#15803d", routerBorder: "#86efac",
    switchBg: "#dbeafe", switchText: "#1d4ed8", switchBorder: "#93c5fd",
    warn: "#d97706", headerGrad: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0fdf4 100%)",
    catBg: "#0284c715", accentBg: "#05966915",
    hintBg: "#f9fafb",
    successBg: "#f0fdf4", successBorder: "#16a34a", successText: "#15803d",
  }
};

// ─── MAIN APP COMPONENT ──────────────────────────────────────────────────────
export default function CiscoLabSimulator() {
  const [selectedLab, setSelectedLab] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceStates, setDeviceStates] = useState({});
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [showHint, setShowHint] = useState({});
  const [completedTasks, setCompletedTasks] = useState({});
  const [sidebarTab, setSidebarTab] = useState("tasks");
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(400);

  // Resizable sidebar drag handlers
  const handleDragStart = useCallback((e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const newW = Math.max(250, Math.min(800, dragStartWidth.current + delta));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);
  const [filterCategory, setFilterCategory] = useState("All");
  const [showLabList, setShowLabList] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [showDesc, setShowDesc] = useState(true);
  const [checkResults, setCheckResults] = useState(null);
  const [checkAnimation, setCheckAnimation] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState({});
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  const T = darkMode ? THEMES.dark : THEMES.light;
  const lab = selectedLab ? LABS.find(l => l.id === selectedLab) : null;

  useEffect(() => {
    if (lab) {
      const states = {};
      lab.devices.forEach(d => { states[d.name] = createDeviceState(d); });
      setDeviceStates(states);
      setSelectedDevice(lab.devices[0]?.name);
      setTerminalHistory([{ type: "system", text: `\n  ═══════════════════════════════════════════════\n  Cisco IOS Simulator — Lab ${lab.id}: ${lab.title}\n  ═══════════════════════════════════════════════\n\n  Type 'enable' then 'configure terminal' to begin.\n  Type '?' for help. Use 'do <cmd>' from config mode.\n` }]);
      setShowHint({});
      setShowDesc(true);
      setCheckResults(null);
    }
  }, [selectedLab]);

  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [terminalHistory]);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [selectedDevice, terminalHistory]);

  const currentState = selectedDevice ? deviceStates[selectedDevice] : null;

  
  // Remove toasts after 4s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(prev => prev.slice(1)), 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const switchDevice = useCallback((deviceName) => {
    setSelectedDevice(deviceName);
    setTerminalHistory(prev => [...prev, { type: "system", text: `\n--- Switched to ${deviceName} console ---\n` }]);
    setCurrentInput("");
    setCmdHistoryIdx(-1);
  }, []);

  const handleCheckWork = useCallback(() => {
    if (!lab) return;
    setCheckAnimation(true);
    setTimeout(() => {
      const results = getTaskResults(lab, deviceStates);
      setCheckResults(results);
      // Update completedTasks for tasks that pass
      const newCompleted = { ...completedTasks };
      let newToasts = [];
      lab.tasks.forEach(task => {
        const key = `${lab.id}-${task.id}`;
        if (results[task.id] && !newCompleted[key]) {
          newCompleted[key] = true;
          newToasts.push({ id: Date.now() + task.id, text: `Task ${task.id} passed!` });
        }
      });
      setCompletedTasks(newCompleted);
      if (newToasts.length > 0) setToasts(prev => [...prev, ...newToasts]);
      setCheckAnimation(false);
    }, 600);
  }, [lab, deviceStates, completedTasks]);


  const handleCommand = useCallback(() => {
    if (!currentState || !currentInput.trim()) return;
    const prompt = getPrompt(currentState);
    const { output, state: newState } = processCommand(currentInput, JSON.parse(JSON.stringify(currentState)));
    setTerminalHistory(prev => [
      ...prev,
      { type: "input", text: `${prompt} ${currentInput}` },
      ...(output ? [{ type: "output", text: output }] : [])
    ]);
    setDeviceStates(prev => ({ ...prev, [selectedDevice]: newState }));
    setCurrentInput("");
    setCmdHistoryIdx(-1);
  }, [currentState, currentInput, selectedDevice]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") { handleCommand(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentState?.commandHistory.length > 0) {
        const newIdx = cmdHistoryIdx < currentState.commandHistory.length - 1 ? cmdHistoryIdx + 1 : cmdHistoryIdx;
        setCmdHistoryIdx(newIdx);
        setCurrentInput(currentState.commandHistory[currentState.commandHistory.length - 1 - newIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdHistoryIdx > 0) { setCmdHistoryIdx(cmdHistoryIdx - 1); setCurrentInput(currentState.commandHistory[currentState.commandHistory.length - cmdHistoryIdx] || ""); }
      else { setCmdHistoryIdx(-1); setCurrentInput(""); }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const partial = currentInput.toLowerCase().trim();
      // Context-aware tab completion
      const isConfig = currentState?.mode?.startsWith("config");
      const isIf = currentState?.mode === "config-if";
      const allCompletions = [
        // universal
        { p: "en", c: "enable", modes: ["user"] },
        { p: "conf", c: "configure terminal", modes: ["privileged"] },
        { p: "sh r", c: "show running-config", modes: ["privileged", "user"] },
        { p: "sh ip int", c: "show ip interface brief", modes: ["privileged", "user"] },
        { p: "sh ip ro", c: "show ip route", modes: ["privileged", "user"] },
        { p: "sh vl", c: "show vlan brief", modes: ["privileged", "user"] },
        { p: "sh ip os", c: "show ip ospf", modes: ["privileged"] },
        { p: "sh cdp n", c: "show cdp neighbors", modes: ["privileged"] },
        { p: "sh cd", c: "show cdp", modes: ["privileged"] },
        { p: "sh lldp n", c: "show lldp neighbors", modes: ["privileged"] },
        { p: "sh ll", c: "show lldp", modes: ["privileged"] },
        { p: "sh ip ac", c: "show ip access-lists", modes: ["privileged"] },
        { p: "sh ip na", c: "show ip nat translations", modes: ["privileged"] },
        { p: "sh ver", c: "show version", modes: ["privileged"] },
        { p: "sh cl", c: "show clock", modes: ["privileged"] },
        { p: "sh po", c: "show port-security", modes: ["privileged"] },
        { p: "sh ip dh", c: "show ip dhcp snooping", modes: ["privileged"] },
        { p: "sh ip ar", c: "show ip arp inspection", modes: ["privileged"] },
        { p: "sh eth", c: "show etherchannel summary", modes: ["privileged"] },
        { p: "sh int t", c: "show interfaces trunk", modes: ["privileged"] },
        { p: "sh int sw", c: "show interfaces switchport", modes: ["privileged"] },
        { p: "sh int st", c: "show interfaces status", modes: ["privileged"] },
        { p: "sh mac", c: "show mac address-table", modes: ["privileged"] },
        { p: "sh span", c: "show spanning-tree", modes: ["privileged"] },
        { p: "sh ipv6 ro", c: "show ipv6 route", modes: ["privileged"] },
        { p: "wr", c: "write memory", modes: ["privileged"] },
        { p: "pi", c: "ping ", modes: ["privileged", "user"] },
        { p: "tr", c: "traceroute ", modes: ["privileged", "user"] },
        // config
        { p: "int ", c: "interface ", modes: ["config"] },
        { p: "int e", c: "interface Ethernet", modes: ["config"] },
        { p: "int g", c: "interface GigabitEthernet", modes: ["config"] },
        { p: "int lo", c: "interface Loopback", modes: ["config"] },
        { p: "int ra", c: "interface range ", modes: ["config"] },
        { p: "ip ro", c: "ip route ", modes: ["config"] },
        { p: "ip ac", c: "ip access-list ", modes: ["config"] },
        { p: "ip na", c: "ip nat ", modes: ["config"] },
        { p: "ip dh", c: "ip dhcp ", modes: ["config"] },
        { p: "ip do", c: "ip domain-name ", modes: ["config"] },
        { p: "ipv6 ro", c: "ipv6 route ", modes: ["config"] },
        { p: "ipv6 u", c: "ipv6 unicast-routing", modes: ["config"] },
        { p: "vl", c: "vlan ", modes: ["config"] },
        { p: "li", c: "line vty 0 4", modes: ["config"] },
        { p: "us", c: "username ", modes: ["config"] },
        { p: "ro", c: "router ospf ", modes: ["config"] },
        { p: "ll", c: "lldp run", modes: ["config"] },
        { p: "cd", c: "cdp run", modes: ["config"] },
        { p: "cr", c: "crypto key generate rsa", modes: ["config"] },
        { p: "nt", c: "ntp ", modes: ["config"] },
        { p: "ho", c: "hostname ", modes: ["config"] },
        { p: "sp", c: "spanning-tree ", modes: ["config"] },
        { p: "no", c: "no ", modes: ["config", "config-if", "config-line", "config-router"] },
        // interface
        { p: "sw m", c: "switchport mode ", modes: ["config-if"] },
        { p: "sw ac", c: "switchport access vlan ", modes: ["config-if"] },
        { p: "sw vo", c: "switchport voice vlan ", modes: ["config-if"] },
        { p: "sw tr e", c: "switchport trunk encapsulation dot1q", modes: ["config-if"] },
        { p: "sw tr a", c: "switchport trunk allowed vlan ", modes: ["config-if"] },
        { p: "sw tr n", c: "switchport trunk native vlan ", modes: ["config-if"] },
        { p: "sw po", c: "switchport port-security", modes: ["config-if"] },
        { p: "sw no", c: "switchport nonegotiate", modes: ["config-if"] },
        { p: "ch", c: "channel-group ", modes: ["config-if"] },
        { p: "ip ad", c: "ip address ", modes: ["config-if"] },
        { p: "ip os", c: "ip ospf ", modes: ["config-if"] },
        { p: "ip na", c: "ip nat ", modes: ["config-if"] },
        { p: "ip dh", c: "ip dhcp snooping trust", modes: ["config-if"] },
        { p: "ipv6 ad", c: "ipv6 address ", modes: ["config-if"] },
        { p: "no sh", c: "no shutdown", modes: ["config-if"] },
        { p: "sh", c: "shutdown", modes: ["config-if"] },
        { p: "sp p", c: "spanning-tree portfast", modes: ["config-if"] },
        { p: "sp b", c: "spanning-tree bpduguard enable", modes: ["config-if"] },
        { p: "ll t", c: "lldp transmit", modes: ["config-if"] },
        { p: "ll r", c: "lldp receive", modes: ["config-if"] },
        { p: "no ll t", c: "no lldp transmit", modes: ["config-if"] },
        { p: "no ll r", c: "no lldp receive", modes: ["config-if"] },
        { p: "cd", c: "cdp enable", modes: ["config-if"] },
        { p: "no cd", c: "no cdp enable", modes: ["config-if"] },
        { p: "de", c: "description ", modes: ["config-if"] },
        // line
        { p: "lo", c: "login local", modes: ["config-line"] },
        { p: "tr", c: "transport input ", modes: ["config-line"] },
        { p: "pa", c: "password ", modes: ["config-line"] },
        { p: "ex", c: "exec-timeout ", modes: ["config-line"] },
        // router
        { p: "ne", c: "network ", modes: ["config-router"] },
        { p: "ro", c: "router-id ", modes: ["config-router"] },
        { p: "pa", c: "passive-interface ", modes: ["config-router"] },
        { p: "lo", c: "log-adjacency-changes", modes: ["config-router"] },
        { p: "re", c: "redistribute ", modes: ["config-router"] },
        // vlan
        { p: "na", c: "name ", modes: ["config-vlan"] },
        // acl
        { p: "pe", c: "permit ", modes: ["config-acl", "config-ext-acl"] },
        { p: "de", c: "deny ", modes: ["config-acl", "config-ext-acl"] },
        { p: "re", c: "remark ", modes: ["config-acl", "config-ext-acl"] },
        // dhcp
        { p: "ne", c: "network ", modes: ["config-dhcp"] },
        { p: "de", c: "default-router ", modes: ["config-dhcp"] },
        { p: "dn", c: "dns-server ", modes: ["config-dhcp"] },
        // do from config
        { p: "do sh r", c: "do show running-config", modes: ["config", "config-if", "config-line", "config-router", "config-vlan", "config-acl", "config-ext-acl", "config-dhcp"] },
        { p: "do sh ip int", c: "do show ip interface brief", modes: ["config", "config-if"] },
        { p: "do sh vl", c: "do show vlan brief", modes: ["config", "config-if"] },
        { p: "do sh ip ro", c: "do show ip route", modes: ["config", "config-if"] },
        { p: "do sh int t", c: "do show interfaces trunk", modes: ["config", "config-if"] },
        { p: "do sh int sw", c: "do show interfaces switchport", modes: ["config", "config-if"] },
        { p: "do sh eth", c: "do show etherchannel summary", modes: ["config", "config-if"] },
        { p: "do sh mac", c: "do show mac address-table", modes: ["config", "config-if"] },
        { p: "do sh span", c: "do show spanning-tree", modes: ["config", "config-if"] },
        { p: "do wr", c: "do write memory", modes: ["config", "config-if"] },
        { p: "do pi", c: "do ping ", modes: ["config", "config-if"] },
      ];

      const mode = currentState?.mode || "";
      const candidates = allCompletions.filter(c =>
        c.modes.some(m => mode === m || (m === "config" && mode.startsWith("config")))
        && partial.startsWith(c.p)
        && partial.length >= c.p.length
        && partial.length <= c.p.length + 4
      );

      if (candidates.length > 0) {
        // Pick the best match (longest prefix match)
        const best = candidates.sort((a, b) => b.p.length - a.p.length)[0];
        setCurrentInput(best.c);
      }
    }
  }, [handleCommand, cmdHistoryIdx, currentState, currentInput]);

  const toggleTaskComplete = (labId, taskId) => {
    setCompletedTasks(prev => { const key = `${labId}-${taskId}`; return { ...prev, [key]: !prev[key] }; });
  };

  const getLabProgress = (labId) => {
    const labObj = LABS.find(l => l.id === labId);
    if (!labObj) return 0;
    const done = labObj.tasks.filter(t => completedTasks[`${labId}-${t.id}`]).length;
    return Math.round((done / labObj.tasks.length) * 100);
  };

  const filteredLabs = filterCategory === "All" ? LABS : LABS.filter(l => l.category === filterCategory);

  // Theme Toggle Button
  const ThemeToggle = () => (
    <button onClick={() => setDarkMode(p => !p)}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, border: `1px solid ${T.border}`, background: T.card, color: T.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.2s" }}
      title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}>
      <span style={{ fontSize: 16 }}>{darkMode ? "☀️" : "🌙"}</span>
      <span>{darkMode ? "Light" : "Dark"}</span>
    </button>
  );

  // CSS keyframes injected once
  const styleTag = `
    @keyframes taskPulse { 0% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(0, 212, 170, 0); } 100% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes checkBounce { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
  `;

  // ─── LAB LIST VIEW ───
  if (showLabList || !selectedLab) {
    return (
      <div style={{ minHeight: "100vh", maxHeight: "100vh", overflow: "auto", background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", transition: "background 0.3s, color 0.3s" }}>
        <style>{styleTag}</style>
        <div style={{ background: T.headerGrad, borderBottom: `1px solid ${T.borderAccent}`, padding: "24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: 1400, margin: "0 auto" }}>
            <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${T.accent}, ${T.accentAlt})`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: darkMode ? "#0a0e17" : "#fff" }}>C</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.accent, letterSpacing: "-0.5px" }}>CCNA 200-301 Lab Simulator</h1>
              <p style={{ margin: 0, fontSize: 12, color: T.textMuted, marginTop: 2 }}>{LABS.length} labs • Cisco IOS CLI • Auto-verify</p>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Completed:</span>
              <span style={{ fontSize: 14, color: T.accent, fontWeight: 700 }}>{Object.values(completedTasks).filter(Boolean).length}/{LABS.reduce((a, l) => a + l.tasks.length, 0)}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 32px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["All", ...CATEGORIES].map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)}
                style={{ padding: "6px 16px", borderRadius: 20, border: filterCategory === cat ? `1px solid ${T.accent}` : `1px solid ${T.border}`, background: filterCategory === cat ? T.accentBg : "transparent", color: filterCategory === cat ? T.accent : T.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.2s" }}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 32px 48px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filteredLabs.map(l => {
            const progress = getLabProgress(l.id);
            return (
              <div key={l.id} onClick={() => { setSelectedLab(l.id); setShowLabList(false); }}
                style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.25s", position: "relative", overflow: "hidden" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "55"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: T.border }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? T.accent : T.accentAlt, transition: "width 0.3s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: T.accentAlt, background: T.catBg, padding: "2px 8px", borderRadius: 6 }}>{l.category}</span>
                  <span style={{ fontSize: 11, color: T.textMuted }}>Lab {l.id}</span>
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{l.title}</h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {l.devices.map(d => (
                    <span key={d.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: d.type === "router" ? T.routerBg : T.switchBg, color: d.type === "router" ? T.routerText : T.switchText, border: `1px solid ${d.type === "router" ? T.routerBorder : T.switchBorder}` }}>
                      {d.type === "router" ? "⟁" : "⊞"} {d.name}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{l.tasks.length} tasks</span>
                  <span style={{ fontSize: 11, color: progress === 100 ? T.accent : T.textMuted }}>{progress === 100 ? "✓ Complete" : `${progress}%`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── LAB SIMULATOR VIEW ───
  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", overflow: "hidden", transition: "background 0.3s, color 0.3s" }}>
      <style>{styleTag}</style>

      {/* Toast notifications */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((toast, i) => (
          <div key={toast.id}
            style={{ background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: 10, padding: "12px 16px", color: T.successText, fontSize: 12, fontFamily: "inherit", maxWidth: 380, animation: "slideIn 0.3s ease-out", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, animation: "checkBounce 0.5s ease-out" }}>✅</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Left Sidebar - Resizable */}
      <div style={{ width: sidebarWidth, minWidth: 250, maxWidth: 800, background: T.bgAlt, borderRight: "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: T.card }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setShowLabList(true)} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>← Labs</button>
            <span style={{ fontSize: 11, color: T.accentAlt, background: T.catBg, padding: "2px 8px", borderRadius: 6 }}>{lab.category}</span>
            <div style={{ marginLeft: "auto" }}><ThemeToggle /></div>
          </div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.accent }}>Lab {lab.id}: {lab.title}</h2>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${getLabProgress(lab.id)}%`, background: T.accent, borderRadius: 2, transition: "width 0.5s ease-out" }} />
            </div>
            <span style={{ fontSize: 11, color: getLabProgress(lab.id) === 100 ? T.accent : T.textMuted, fontWeight: getLabProgress(lab.id) === 100 ? 700 : 400 }}>
              {getLabProgress(lab.id) === 100 ? "✓ DONE" : `${getLabProgress(lab.id)}%`}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
          {["tasks", "topology", "config"].map(tab => (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              style={{ flex: 1, padding: "10px 8px", background: sidebarTab === tab ? T.card : "transparent", border: "none", borderBottom: sidebarTab === tab ? `2px solid ${T.accent}` : "2px solid transparent", color: sidebarTab === tab ? T.accent : T.textMuted, cursor: "pointer", fontSize: 11, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1 }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {sidebarTab === "tasks" && (
            <div>
              {/* Check My Work Button */}
              <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={handleCheckWork}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `2px solid ${T.accent}`, background: checkAnimation ? T.accent : "transparent", color: checkAnimation ? (darkMode ? "#0a0e17" : "#fff") : T.accent, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", transition: "all 0.3s", letterSpacing: 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {checkAnimation ? "⏳ Checking..." : "🔍 Check My Work"}
                </button>
                {checkResults && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: Object.values(checkResults).every(Boolean) ? T.accent : T.warn }}>
                    {Object.values(checkResults).filter(Boolean).length}/{Object.values(checkResults).length}
                  </span>
                )}
              </div>
              {checkResults && (
                <div style={{ marginBottom: 12, background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Verification Results</div>
                  {lab.tasks.map((task) => {
                    const passed = checkResults[task.id];
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                        <span style={{ fontSize: 16, minWidth: 20, textAlign: "center" }}>{passed ? "✅" : "❌"}</span>
                        <span style={{ color: passed ? T.successText : T.warn }}>Task {task.id}: {task.device}</span>
                        {!passed && <span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>needs work</span>}
                      </div>
                    );
                  })}
                  {Object.values(checkResults).every(Boolean) && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: T.successBg, borderRadius: 6, border: `1px solid ${T.successBorder}`, textAlign: "center", fontSize: 13, fontWeight: 700, color: T.successText }}>
                      🎉 All tasks complete! Lab passed!
                    </div>
                  )}
                </div>
              )}

              {/* Lab Instructions */}
              {LAB_DESCRIPTIONS[lab.id] && (
                <div style={{ marginBottom: 16, background: T.card, borderRadius: 8, border: `1px solid ${T.accentAlt}33`, overflow: "hidden" }}>
                  <button onClick={() => setShowDesc(p => !p)}
                    style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", color: T.text }}>
                    <span style={{ fontSize: 14 }}>📋</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.accentAlt }}>Lab Instructions</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.textMuted }}>{showDesc ? "▲ Hide" : "▼ Show"}</span>
                  </button>
                  {showDesc && (
                    <div style={{ padding: "0 12px 12px" }}>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                        {LAB_DESCRIPTIONS[lab.id]}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {lab.tasks.map((task, idx) => {
                const key = `${lab.id}-${task.id}`;
                const isComplete = completedTasks[key];
                const checkPassed = checkResults ? checkResults[task.id] : null;
                const isRecent = recentlyCompleted[key];
                const hintVisible = showHint[key];
                return (
                  <div key={task.id} style={{
                    marginBottom: 12, background: isComplete ? T.successBg : T.card, borderRadius: 8,
                    border: `1px solid ${checkPassed === true ? T.successBorder : checkPassed === false ? '#ef4444' : isComplete ? T.successBorder : T.border}`,
                    overflow: "hidden", transition: "all 0.4s ease-out",
                    animation: isRecent ? "taskPulse 1s ease-out 2" : "none",
                  }}>
                    <div style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{
                        width: 22, height: 22, minWidth: 22, borderRadius: 6,
                        border: `2px solid ${isComplete ? T.successBorder : T.textMuted}`,
                        background: isComplete ? T.successBorder : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginTop: 1, transition: "all 0.3s",
                        cursor: "pointer",
                      }} onClick={() => toggleTaskComplete(lab.id, task.id)}>
                        {isComplete && (
                          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, animation: isRecent ? "checkBounce 0.5s ease-out" : "none" }}>✓</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: T.accentAlt }}>Task {idx + 1}</span>
                          <span style={{ color: T.textMuted }}>•</span>
                          <span style={{ color: T.switchText }}>{task.device}</span>
                          {checkPassed === true && <span style={{ color: T.successText, fontSize: 10, fontWeight: 600, background: T.successBg, padding: "1px 6px", borderRadius: 4, border: `1px solid ${T.successBorder}` }}>PASS ✓</span>}
                          {checkPassed === false && <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 600, background: darkMode ? "#1c0a0a" : "#fef2f2", padding: "1px 6px", borderRadius: 4, border: "1px solid #ef4444" }}>FAIL ✗</span>}
                        </div>
                        <div style={{ fontSize: 12, color: isComplete ? T.textMuted : T.text, lineHeight: 1.4, textDecoration: isComplete ? "line-through" : "none" }}>{task.text}</div>
                      </div>
                    </div>
                    <div style={{ padding: "0 12px 8px", display: "flex", gap: 6 }}>
                      <button onClick={() => switchDevice(task.device)}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.switchText, cursor: "pointer", fontFamily: "inherit" }}>
                        Open {task.device}
                      </button>
                      <button onClick={() => setShowHint(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg, color: T.warn, cursor: "pointer", fontFamily: "inherit" }}>
                        {hintVisible ? "Hide" : "Show"} Solution
                      </button>
                    </div>
                    {hintVisible && (
                      <div style={{ padding: "8px 12px", background: T.hintBg, borderTop: `1px solid ${T.border}` }}>
                        <pre style={{ margin: 0, fontSize: 11, color: T.routerText, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{task.hint}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {sidebarTab === "topology" && (
            <div>
              {TOPO_IMAGES[lab.id] && (
                <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12, marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Topology Diagram</h3>
                  <img src={TOPO_IMAGES[lab.id]} alt={`Lab ${lab.id} topology`}
                    style={{ width: "100%", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff" }} />
                </div>
              )}
              <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Network Topology (Text)</h3>
                <pre style={{ margin: 0, fontSize: 11, color: T.textDim, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{lab.topology}</pre>
              </div>
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Devices</h3>
                {lab.devices.map(d => (
                  <div key={d.name} style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{d.type === "router" ? "⟁" : "⊞"}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: d.type === "router" ? T.routerText : T.switchText }}>{d.name}</span>
                      <span style={{ fontSize: 10, color: T.textMuted }}>({d.type})</span>
                    </div>
                    {d.interfaces && Object.entries(d.interfaces).map(([name, info]) => (
                      <div key={name} style={{ fontSize: 11, color: T.textDim, marginLeft: 22 }}>{name}: {info.ip || "L2"} [{info.status}]</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {sidebarTab === "config" && currentState && (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 12, color: T.accent, letterSpacing: 1, textTransform: "uppercase" }}>Running Config — {selectedDevice}</h3>
              <div style={{ background: "#0a0e17", borderRadius: 8, border: "1px solid #1e2a3a", padding: 12, maxHeight: "60vh", overflow: "auto" }}>
                <pre style={{ margin: 0, fontSize: 11, color: "#8b9bb4", whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>
                  {buildRunningConfig(currentState)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag Handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 6, cursor: "col-resize", background: T.borderAccent,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s", flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.accent + "60"}
        onMouseLeave={e => e.currentTarget.style.background = T.borderAccent}
      >
        <div style={{ width: 2, height: 40, borderRadius: 1, background: T.textMuted + "40" }} />
      </div>

      {/* Right Side - Terminal (ALWAYS DARK) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", background: "#111820", borderBottom: "1px solid #1e2a3a", padding: "0 8px", minHeight: 40 }}>
          {lab.devices.map(d => (
            <button key={d.name} onClick={() => switchDevice(d.name)}
              style={{ padding: "8px 16px", background: selectedDevice === d.name ? "#0a0e17" : "transparent", border: "none", borderBottom: selectedDevice === d.name ? "2px solid #00d4aa" : "2px solid transparent", color: selectedDevice === d.name ? "#00d4aa" : "#6b7b8d", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10 }}>{d.type === "router" ? "⟁" : "⊞"}</span>{d.name}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, paddingRight: 8 }}>
            <button onClick={() => setTerminalHistory([])} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 4, border: "1px solid #1e2a3a", background: "transparent", color: "#6b7b8d", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        </div>

        <div ref={terminalRef} onClick={() => inputRef.current?.focus()}
          style={{ flex: 1, overflow: "auto", padding: "12px 16px", background: "#0a0e17", cursor: "text" }}>
          {terminalHistory.map((entry, i) => (
            <div key={i} style={{
              color: entry.type === "system" ? "#0891b2" : entry.type === "input" ? "#e0e6ed" : entry.type === "success" ? "#4ade80" : "#8b9bb4",
              fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "inherit"
            }}>{entry.text}</div>
          ))}
          {currentState && (
            <div style={{ display: "flex", alignItems: "center", fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: "#00d4aa", whiteSpace: "pre" }}>{getPrompt(currentState)} </span>
              <input ref={inputRef} value={currentInput} onChange={e => setCurrentInput(e.target.value)} onKeyDown={handleKeyDown}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e6ed", fontSize: 13, fontFamily: "inherit", caretColor: "#00d4aa", padding: 0, margin: 0 }}
                spellCheck={false} autoComplete="off" autoFocus />
            </div>
          )}
        </div>

        <div style={{ background: "#111820", borderTop: "1px solid #1e2a3a", padding: "6px 16px", display: "flex", alignItems: "center", gap: 16, fontSize: 10, color: "#6b7b8d" }}>
          <span>Mode: <span style={{ color: "#00d4aa" }}>{currentState?.mode || "—"}</span></span>
          {currentState?.currentInterface && <span>Int: <span style={{ color: "#f59e0b" }}>{currentState.currentInterface}</span></span>}
          {currentState?.currentVlan && <span>VLAN: <span style={{ color: "#f59e0b" }}>{currentState.currentVlan}</span></span>}
          {currentState?.currentRouter && <span>Router: <span style={{ color: "#f59e0b" }}>{currentState.currentRouter}</span></span>}
          {currentState?.currentAcl && <span>ACL: <span style={{ color: "#f59e0b" }}>{currentState.currentAcl}</span></span>}
          {currentState?.currentDhcpPool && <span>DHCP: <span style={{ color: "#f59e0b" }}>{currentState.currentDhcpPool}</span></span>}
          {currentState?.currentLine && <span>Line: <span style={{ color: "#f59e0b" }}>{currentState.currentLine}</span></span>}
          <span style={{ marginLeft: "auto" }}>Tab: autocomplete • ↑↓: history • do: exec from config</span>
        </div>
      </div>
    </div>
  );
}
