// iosCmdTree.js — IOS command tree for ? and Tab completion

function leaf(d) { return { _desc: d, _eol: true }; }
function node(d, c) { return { _desc: d, _eol: false, ...c }; }
function both(d, c) { return { _desc: d, _eol: true, ...c }; }

// ─── shared subtrees ─────────────────────────────────────────────────────────
const STD_SRC = {
  any:  leaf("Any source host"),
  host: node("A single source host", { _arg: leaf("<ip>  Source host IP address") }),
  _arg: both("<A.B.C.D>  Source address", { _arg: leaf("<A.B.C.D>  Source wildcard bits") }),
};

const EXT_PROTO = {
  ip:   node("Any Internet Protocol", { any: node("Any src", { any: both("Any dst",{}), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }), host: node("Host src", { _arg: node("<src>", { any: both("Any dst",{}), host: node("Host dst",{ _arg: leaf("<dst>") }), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}), host: node("Host dst",{ _arg: leaf("<dst>") }), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }) }),
  tcp:  node("Transmission Control Protocol", { any: node("Any src", { any: both("Any dst",{ eq: node("Match port",{ _arg: leaf("<0-65535>  Port") }) }), host: node("Host dst",{ _arg: both("<dst>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), eq: node("Match src port",{ _arg: leaf("<0-65535>") }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }), host: node("Host dst",{ _arg: both("<dst>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), eq: node("Match src port",{ _arg: leaf("<0-65535>") }) }) }) }),
  udp:  node("User Datagram Protocol", { any: node("Any src", { any: both("Any dst",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }) }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }) }) }) }) }),
  icmp: node("ICMP", { any: node("Any src", { any: leaf("Any dst"), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: leaf("Any dst"), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }) }),
  ospf: node("OSPF routing protocol", { any: node("Any src", { any: leaf("Any dst") }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: leaf("Any dst") }) }) }),
  eigrp:node("EIGRP routing protocol", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: leaf("Any dst") }) }) }),
  gre:  node("GRE tunnels", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: leaf("Any dst") }) }) }),
};

const DO_CMDS = node("Execute an EXEC-level command", {
  show: node("Show running system information", {
    "running-config": leaf("Current operating configuration"),
    ip: node("IP information", {
      interface: both("IP interface status", { brief: leaf("Brief summary") }),
      route:     both("IP routing table", {}),
      ospf:      both("OSPF information", { neighbor: leaf("Neighbors"), interface: leaf("Interfaces"), database: leaf("Database") }),
      "access-lists": leaf("List IP access lists"),
      nat:       both("NAT information", { translations: leaf("Translations") }),
      dhcp:      both("DHCP information", { snooping: leaf("Snooping info"), binding: leaf("Bindings") }),
    }),
    interfaces:    both("Interface status", { trunk: leaf("Trunk interfaces"), switchport: leaf("Switchport info"), status: leaf("Status") }),
    vlan:          both("VTP VLAN status", { brief: leaf("Brief") }),
    etherchannel:  both("EtherChannel information", { summary: leaf("Summary") }),
    "spanning-tree": both("Spanning tree", { _arg: leaf("<vlan-id>") }),
    cdp:           both("CDP information", { neighbors: leaf("Neighbor entries") }),
    lldp:          both("LLDP information", { neighbors: leaf("Neighbor entries") }),
    "port-security": leaf("Port security information"),
    mac:           node("MAC information", { "address-table": both("MAC table", { dynamic: leaf("Dynamic entries") }) }),
    arp:           leaf("ARP table"),
    version:       leaf("System version"),
    clock:         leaf("System clock"),
  }),
  ping:  both("Send echo messages", { _arg: leaf("<A.B.C.D>  Destination") }),
  write: both("Write running configuration", { memory: leaf("Write to NV memory") }),
  clear: node("Reset functions", { ip: node("IP functions", { ospf: node("OSPF", { process: leaf("Reset OSPF process") }) }), arp: leaf("Clear ARP cache") }),
});

const IFACE_NUMS = {
  "0/0": leaf("Interface 0/0"), "0/1": leaf("Interface 0/1"),
  "0/2": leaf("Interface 0/2"), "0/3": leaf("Interface 0/3"),
  "0/4": leaf("Interface 0/4"), "0/5": leaf("Interface 0/5"),
  "0/6": leaf("Interface 0/6"), "0/7": leaf("Interface 0/7"),
  "0/8": leaf("Interface 0/8"), "0/9": leaf("Interface 0/9"),
  "0/10": leaf("Interface 0/10"), "0/11": leaf("Interface 0/11"),
  "0/12": leaf("Interface 0/12"),
  _arg: leaf("<slot/port>  Interface number"),
};

// ─── CMD_TREE ─────────────────────────────────────────────────────────────────
export const CMD_TREE = {

  // ── USER EXEC ────────────────────────────────────────────────────────────
  user: {
    enable:     leaf("Turn on privileged commands"),
    exit:       leaf("Exit from the EXEC"),
    logout:     leaf("Exit from the EXEC"),
    ping:       both("Send echo messages", { _arg: leaf("<A.B.C.D>  Ping destination address") }),
    show:       node("Show running system information", {
      arp:      leaf("ARP table"),
      clock:    leaf("Display the system clock"),
      ip:       node("IP information", {
        interface: both("IP interface status", { brief: leaf("Brief summary of IP status") }),
        route:     both("IP routing table", { _arg: leaf("<A.B.C.D>  Network to display") }),
      }),
      version:  leaf("System hardware and software status"),
      vlan:     both("VTP VLAN status", { brief: leaf("Brief VTP VLAN status") }),
    }),
    traceroute: both("Trace route to destination", { _arg: leaf("<A.B.C.D>  Trace route to destination") }),
  },

  // ── PRIVILEGED EXEC ──────────────────────────────────────────────────────
  privileged: {
    clear: node("Reset functions", {
      arp:         leaf("Clear the entire ARP cache"),
      counters:    leaf("Clear counters on one or all interfaces"),
      ip:          node("IP functions", {
        arp:       leaf("Clear ARP cache"),
        dhcp:      node("DHCP", { binding: both("DHCP bindings", { "*": leaf("All bindings") }) }),
        nat:       node("NAT", { translation: leaf("NAT translations") }),
        ospf:      node("OSPF", { process: leaf("Reset OSPF process") }),
      }),
      mac:         node("MAC functions", { "address-table": both("MAC table", { dynamic: leaf("Dynamic entries only") }) }),
      "spanning-tree": leaf("Reset spanning-tree"),
    }),
    clock: node("Manage the system clock", {
      set: node("Set the time and date", {
        _arg: node("<hh:mm:ss>  Current time", {
          _arg: node("<1-31>  Day of month", {
            January: node("January", { _arg: leaf("<1993-2035>  Year") }),
            February: node("February", { _arg: leaf("<1993-2035>  Year") }),
            March:    node("March", { _arg: leaf("<1993-2035>  Year") }),
            April:    node("April", { _arg: leaf("<1993-2035>  Year") }),
            May:      node("May", { _arg: leaf("<1993-2035>  Year") }),
            June:     node("June", { _arg: leaf("<1993-2035>  Year") }),
            July:     node("July", { _arg: leaf("<1993-2035>  Year") }),
            August:   node("August", { _arg: leaf("<1993-2035>  Year") }),
            September:node("September", { _arg: leaf("<1993-2035>  Year") }),
            October:  node("October", { _arg: leaf("<1993-2035>  Year") }),
            November: node("November", { _arg: leaf("<1993-2035>  Year") }),
            December: node("December", { _arg: leaf("<1993-2035>  Year") }),
          }),
        }),
      }),
    }),
    configure: node("Enter configuration mode", { terminal: leaf("Configure from the terminal") }),
    copy: node("Copy from one file to another", {
      "running-config":  node("Copy running config", { "startup-config": leaf("Copy to startup config"), tftp: leaf("Copy to TFTP") }),
      "startup-config":  node("Copy startup config", { "running-config": leaf("Copy to running config") }),
    }),
    crypto: node("Encryption module", { key: node("Key configuration", {
      generate: node("Generate new keys", { rsa: leaf("Generate RSA keys") }),
      zeroize:  node("Remove keys", { rsa: leaf("Remove RSA keys") }),
    }) }),
    debug: node("Debugging functions", {
      all:  leaf("Enable all debugging"),
      ip:   node("IP information", {
        ospf:  both("OSPF information", { adj: leaf("Adjacency"), events: leaf("Events") }),
        nat:   leaf("NAT events"),
        rip:   leaf("RIP information"),
      }),
      "spanning-tree": leaf("Spanning tree information"),
    }),
    disable:   leaf("Turn off privileged commands"),
    erase:     node("Erase a filesystem", { "startup-config": leaf("Erase startup configuration") }),
    exit:      leaf("Exit from the EXEC"),
    logout:    leaf("Exit from the EXEC"),
    ping:      both("Send echo messages", { _arg: leaf("<A.B.C.D>  Ping destination address") }),
    reload:    leaf("Halt and perform a cold restart"),
    show: node("Show running system information", {
      arp:           leaf("ARP table"),
      cdp:           both("CDP information", { neighbors: both("CDP neighbor entries", { detail: leaf("Detailed information") }), interface: leaf("CDP interface status") }),
      clock:         leaf("Display the system clock"),
      etherchannel:  both("EtherChannel information", { summary: leaf("One-line-per-channel-group summary"), detail: leaf("Detailed EtherChannel info") }),
      "flash:":      leaf("Flash filesystem information"),
      history:       leaf("Display the session command history"),
      interfaces:    both("Interface status and configuration", {
        _arg:        both("<interface>  Interface name", { switchport: leaf("Switchport info") }),
        status:      leaf("Interface line status"),
        switchport:  leaf("Show switchport information"),
        trunk:       leaf("Show trunk interface information"),
      }),
      inventory:     leaf("Show the physical inventory"),
      ip: node("IP information", {
        "access-lists": both("List IP access lists", { _arg: leaf("<n>  Access list name") }),
        arp:           both("ARP table", { _arg: leaf("<A.B.C.D>  IP address") }),
        "arp-inspection": both("Dynamic ARP Inspection", { statistics: leaf("DAI statistics"), vlan: leaf("DAI VLAN info") }),
        dhcp:          both("DHCP information", {
          binding:     leaf("DHCP address bindings"),
          pool:        leaf("DHCP pools"),
          snooping:    both("DHCP snooping info", { binding: leaf("Snooping bindings"), statistics: leaf("Statistics") }),
        }),
        interface:     both("IP interface status", { brief: leaf("Brief summary of IP status and configuration"), _arg: leaf("<interface>") }),
        nat:           both("NAT information", { translations: leaf("Address translations"), statistics: leaf("Statistics") }),
        ospf:          both("OSPF information", {
          database:    leaf("OSPF database summary"),
          interface:   leaf("OSPF interface information"),
          neighbor:    both("OSPF neighbor info", { detail: leaf("Detailed info") }),
        }),
        protocols:     leaf("IP routing protocol info"),
        route:         both("IP routing table", { connected: leaf("Connected routes"), ospf: leaf("OSPF routes"), static: leaf("Static routes"), _arg: leaf("<A.B.C.D>  Network") }),
        ssh:           leaf("SSH information"),
      }),
      ipv6: node("IPv6 information", {
        interface:     both("IPv6 interface status", { brief: leaf("Brief summary"), _arg: leaf("<interface>") }),
        neighbors:     leaf("IPv6 neighbor cache"),
        route:         both("IPv6 routing table", { _arg: leaf("<prefix>") }),
      }),
      lldp:          both("LLDP information", { neighbors: both("LLDP neighbor entries", { detail: leaf("Detailed info") }), interface: leaf("LLDP interface status") }),
      logging:       leaf("Contents of logging buffers"),
      mac:           node("MAC information", { "address-table": both("MAC forwarding table", { dynamic: leaf("Dynamic entries only") }) }),
      "port-security": both("Port security information", { interface: leaf("Interface info"), address: leaf("Address table") }),
      "running-config": leaf("Current operating configuration"),
      "spanning-tree": both("Spanning tree topology", { _arg: leaf("<vlan-id>"), detail: leaf("Detailed info"), summary: leaf("Port state summary") }),
      "startup-config": leaf("Contents of startup configuration"),
      users:         leaf("Display information about terminal lines"),
      version:       leaf("System hardware and software status"),
      vlan:          both("VTP VLAN status", { brief: leaf("Brief VTP VLAN status"), _arg: leaf("<vlan-id>") }),
    }),
    ssh:       node("Open a secure shell client connection", { "-l": node("Specify login name", { _arg: node("<username>", { _arg: leaf("<A.B.C.D>  Remote host IP") }) }) }),
    terminal:  node("Set terminal line parameters", { length: leaf("<0-512>  Number of lines (0=no pause)") }),
    traceroute: both("Trace route to destination", { _arg: leaf("<A.B.C.D>  Destination") }),
    undebug:   both("Disable debugging functions", { all: leaf("Turn off all debugging") }),
    write:     both("Write running configuration", { memory: leaf("Write to NV memory"), terminal: leaf("Write to terminal"), erase: leaf("Erase NV memory") }),
  },

  // ── GLOBAL CONFIG ────────────────────────────────────────────────────────
  config: {
    cdp:       both("Configure CDP", { run: leaf("Enable CDP"), "advertise-v2": leaf("Enable CDP version 2") }),
    enable:    node("Modify enable password", { password: leaf("<password>  Enable password"), secret: leaf("<secret>  Enable secret password") }),
    errdisable: node("ErrDisable", { recovery: node("Recovery", { cause: leaf("<cause>"), interval: leaf("<30-86400>  Interval") }) }),
    hostname:  both("Set system's network name", { _arg: leaf("<n>  System network name") }),
    interface: node("Select an interface to configure", {
      ethernet:       node("Ethernet IEEE 802.3", { ...IFACE_NUMS }),
      fastethernet:   node("FastEthernet IEEE 802.3", { "0/1": leaf("FastEthernet0/1"), "0/2": leaf("FastEthernet0/2"), "0/3": leaf("FastEthernet0/3"), "0/4": leaf("FastEthernet0/4"), _arg: leaf("<slot/port>") }),
      gigabitethernet: node("GigabitEthernet IEEE 802.3z", { "0/0": leaf("GigabitEthernet0/0"), "0/1": leaf("GigabitEthernet0/1"), "0/2": leaf("GigabitEthernet0/2"), "0/3": leaf("GigabitEthernet0/3"), "1/0": leaf("GigabitEthernet1/0"), "1/1": leaf("GigabitEthernet1/1"), _arg: leaf("<slot/port>") }),
      loopback:       node("Loopback interface", { "0": leaf("Loopback0"), "1": leaf("Loopback1"), _arg: leaf("<0-2147483647>  Loopback number") }),
      "port-channel": node("EtherChannel interface", { "1": leaf("Port-channel1"), "2": leaf("Port-channel2"), _arg: leaf("<1-64>  Port-channel number") }),
      range:          leaf("<interface-range>  Configure interface range"),
      serial:         node("Serial interface", { _arg: leaf("<slot/port>") }),
      vlan:           node("Catalyst VLANs", { _arg: leaf("<1-4094>  VLAN interface number") }),
    }),
    ip: node("Global IP configuration subcommands", {
      "access-list": node("Named access-list", {
        extended: node("Extended access list", { _arg: leaf("<n>  Access list name") }),
        standard: node("Standard access list", { _arg: leaf("<n>  Access list name") }),
      }),
      arp: node("ARP configuration", { inspection: node("Dynamic ARP Inspection", {
        validate: node("DAI validation", { "dst-mac": leaf("Validate destination MAC"), "src-mac": leaf("Validate source MAC"), ip: leaf("Validate IP addresses") }),
        vlan: node("Enable DAI on VLAN", { _arg: leaf("<1-4094>  VLAN number") }),
      }) }),
      classless: leaf("Follow classless routing rules"),
      "default": node("Set a command to defaults", { gateway: leaf("<A.B.C.D>  Default gateway") }),
      dhcp: node("DHCP configuration commands", {
        "excluded-address": both("Prevent DHCP from assigning addresses", { _arg: both("<low-address>  Low IP", { _arg: leaf("<high-address>  High IP") }) }),
        pool: node("Configure DHCP address pool", { _arg: leaf("<n>  Pool name") }),
        snooping: both("DHCP Snooping", {
          information: node("DHCP Snooping information", { option: leaf("DHCP option 82") }),
          verify:      node("Verify source address", { "mac-address": leaf("Verify source MAC matches hardware") }),
          vlan:        node("Enable DHCP snooping on VLAN", { _arg: leaf("<1-4094>  VLAN number") }),
        }),
      }),
      "domain-name": both("Define the default domain name", { _arg: leaf("<n>  Domain name") }),
      "domain-lookup": leaf("Enable DNS hostname translation"),
      http: node("HTTP server", { server: leaf("Enable HTTP server"), "secure-server": leaf("Enable HTTPS server") }),
      nat: node("NAT configuration", {
        inside: node("Inside address translation", {
          source: node("Source address translation", {
            list: node("Specify access list", { _arg: node("<acl>  Access list name", { interface: node("Specify interface", { _arg: both("<interface>", { overload: leaf("Overload address translation") }) }), pool: node("Specify pool", { _arg: both("<n>  Pool name", { overload: leaf("Overload address translation") }) }) }) }),
            static: node("Static translation", { _arg: node("<local-ip>  Local IP", { _arg: leaf("<global-ip>  Global IP") }) }),
          }),
        }),
        pool: node("Define global address pool", { _arg: node("<n>  Pool name", { _arg: node("<start-ip>  Start IP", { _arg: node("<end-ip>  End IP", { netmask: node("Specify netmask", { _arg: leaf("<mask>  Subnet mask") }) }) }) }) }),
      }),
      route: both("Establish static routes", { _arg: node("<A.B.C.D>  Destination network", { _arg: node("<A.B.C.D>  Destination mask", { _arg: both("<A.B.C.D>  Forwarding router or interface", { _arg: leaf("<1-255>  Administrative distance"), permanent: leaf("Permanent route"), name: node("Give name", { _arg: leaf("<tag>  Route tag") }) }) }) }) }),
      ssh: node("Configure SSH server", { version: node("SSH version", { "1": leaf("Version 1"), "2": leaf("Version 2") }), "time-out": leaf("<1-120>  SSH timeout in seconds") }),
    }),
    ipv6: node("IPv6 global configuration", {
      route: both("Establish IPv6 static routes", { _arg: node("<X:X:X:X::X/n>  IPv6 prefix", { _arg: both("<X:X:X:X::X>  Next-hop IPv6 address", { _arg: leaf("<1-254>  Administrative distance") }) }) }),
      "unicast-routing": leaf("Enable IPv6 unicast routing"),
    }),
    line: node("Configure a terminal line", {
      console: node("Primary terminal line", { _arg: leaf("<0>  Line number") }),
      vty:     node("Virtual terminal", { _arg: node("<0-4>  First line number", { _arg: leaf("<0-15>  Last line number") }) }),
    }),
    lldp: both("Global LLDP configuration commands", { run: leaf("Enable LLDP") }),
    logging: node("Modify message logging", { buffered: leaf("<4096-2147483647>  Buffer size"), console: leaf("Console logging") }),
    "no": node("Negate a command or set its defaults", {
      cdp:  node("CDP commands", { run: leaf("Disable CDP") }),
      ip:   node("IP commands", { "domain-lookup": leaf("Disable DNS lookup"), http: node("HTTP", { server: leaf("Disable HTTP server"), "secure-server": leaf("Disable HTTPS server") }) }),
      lldp: node("LLDP commands", { run: leaf("Disable LLDP") }),
    }),
    ntp: node("Configure NTP", {
      master:  both("Act as NTP master clock", { _arg: leaf("<1-15>  Stratum number") }),
      server:  node("Configure NTP server", { _arg: both("<A.B.C.D>  NTP server IP", { prefer: leaf("Prefer this server") }) }),
    }),
    router: node("Enable a routing process", {
      ospf:  node("Open Shortest Path First (OSPF)", { _arg: leaf("<1-65535>  Process ID") }),
      eigrp: node("Enhanced IGRP", { _arg: leaf("<1-65535>  AS number") }),
      rip:   leaf("Routing Information Protocol (RIP)"),
    }),
    service: node("Modify use of network based services", {
      "password-encryption": leaf("Encrypt system passwords"),
      timestamps: node("Timestamp debug/log messages", { debug: node("Debug", { datetime: leaf("Timestamp with date and time") }), log: node("Log", { datetime: leaf("Timestamp with date and time") }) }),
    }),
    "spanning-tree": both("Spanning Tree Subsystem", {
      mode: node("Spanning tree operating mode", { "pvst": leaf("Per-VLAN spanning tree mode"), "rapid-pvst": leaf("Per-VLAN rapid spanning tree mode"), mst: leaf("Multiple spanning tree mode") }),
      vlan: node("VLAN Switch Spanning Tree", { _arg: node("<1-4094>  VLAN number", { priority: node("Port priority", { _arg: leaf("<0-61440>  Priority (multiples of 4096)") }), root: node("Configure as root", { primary: leaf("Primary root"), secondary: leaf("Secondary root") }) }) }),
    }),
    username: node("Establish user name authentication", {
      _arg: node("<n>  User name", {
        "algorithm-type": node("Specify encryption algorithm", {
          md5:    node("MD5 algorithm", { secret: node("Specify secret", { _arg: leaf("<secret>  Secret string") }) }),
          scrypt: node("SCRYPT hashing algorithm", { secret: node("Specify secret", { _arg: leaf("<secret>  Secret string") }) }),
          sha256: node("SHA256/PBKDF2 algorithm", { secret: node("Specify secret", { _arg: leaf("<secret>  Secret string") }) }),
        }),
        password:  node("Specify password", { _arg: leaf("<password>  User password") }),
        privilege: node("Set user privilege level", {
          _arg: node("<0-15>  Privilege level", {
            "algorithm-type": node("Specify encryption algorithm", {
              md5:    node("MD5", { secret: node("Specify secret", { _arg: leaf("<secret>") }) }),
              scrypt: node("SCRYPT", { secret: node("Specify secret", { _arg: leaf("<secret>") }) }),
              sha256: node("SHA256", { secret: node("Specify secret", { _arg: leaf("<secret>") }) }),
            }),
            password: node("Specify password", { _arg: leaf("<password>") }),
            secret:   node("Specify secret", { _arg: leaf("<secret>") }),
          }),
        }),
        secret: node("Specify the secret for the user", { _arg: leaf("<secret>  Secret string") }),
      }),
    }),
    vlan: both("VLAN commands", { _arg: leaf("<1-4094>  VLAN ID") }),
  },

  // ── INTERFACE CONFIG ─────────────────────────────────────────────────────
  "config-if": {
    do: DO_CMDS,
    cdp: both("CDP interface subcommands", { enable: leaf("Enable CDP on this interface") }),
    "channel-group": node("EtherChannel/port bundling", { _arg: node("<1-64>  Channel group number", { mode: node("EtherChannel mode", { active: leaf("Enable LACP unconditionally"), passive: leaf("Enable LACP only if LACP device detected"), on: leaf("Enable EtherChannel only"), desirable: leaf("Enable PAgP unconditionally"), auto: leaf("Enable PAgP only if PAgP device detected") }) }) }),
    description: both("Interface specific description", { _arg: leaf("<line>  Up to 240 characters") }),
    duplex: node("Configure duplex operation", { auto: leaf("Auto duplex negotiation"), full: leaf("Force full duplex operation"), half: leaf("Force half-duplex operation") }),
    encapsulation: node("Set encapsulation type", { dot1q: node("IEEE 802.1Q Virtual LAN", { _arg: both("<1-4094>  VLAN ID", { native: leaf("Make this native VLAN") }) }) }),
    ip: node("Interface Internet Protocol config", {
      "access-group": node("Specify access control for packets", { _arg: node("<n>  Access list name", { in: leaf("Inbound packets"), out: leaf("Outbound packets") }) }),
      address: both("Set the IP address of an interface", { _arg: node("<A.B.C.D>  IP address", { _arg: leaf("<A.B.C.D>  IP subnet mask") }), dhcp: leaf("IP Address negotiated via DHCP") }),
      arp:  node("ARP commands", { inspection: node("ARP inspection", { trust: leaf("Configure interface as trusted for ARP inspection"), limit: node("Rate limit", { rate: leaf("<0-2048>  Rate in packets/second") }) }) }),
      dhcp: node("DHCP on interface commands", { snooping: node("DHCP Snooping interface subcommands", { trust: leaf("Configure interface as trusted"), limit: node("Rate limit DHCP packets", { rate: leaf("<1-2048>  Rate in packets/second") }) }) }),
      "helper-address": both("Specify destination for UDP broadcasts", { _arg: leaf("<A.B.C.D>  IP destination address") }),
      nat:  node("NAT interface commands", { inside: leaf("Inside interface for address translation"), outside: leaf("Outside interface for address translation") }),
      ospf: both("OSPF interface commands", { _arg: node("<1-65535>  Process ID", { area: node("Set the OSPF area ID", { _arg: leaf("<0-4294967295>  OSPF area ID") }) }), cost: node("Interface cost", { _arg: leaf("<1-65535>  OSPF link cost") }), "dead-interval": node("Dead interval", { _arg: leaf("<1-65535>  Seconds") }), "hello-interval": node("Hello interval", { _arg: leaf("<1-65535>  Seconds") }), priority: node("Router priority", { _arg: leaf("<0-255>  Priority for DR/BDR election") }) }),
    }),
    ipv6: node("IPv6 interface subcommands", {
      address: both("Configure IPv6 address", { _arg: both("<X:X:X:X::X/n>  IPv6 address", { "eui-64": leaf("Use 64-bit Extended Unique Identifier"), anycast: leaf("Configure as anycast address") }), autoconfig: leaf("Obtain address using autoconfiguration"), dhcp: leaf("Obtain address using DHCP") }),
      enable: leaf("Enable IPv6 processing"),
      ospf:   both("OSPF interface commands", { _arg: node("<1-65535>  Process ID", { area: node("OSPF area", { _arg: leaf("<0-4294967295>  Area ID") }) }) }),
    }),
    lldp: both("LLDP interface subcommands", { transmit: leaf("Enable LLDP transmission on this interface"), receive: leaf("Enable LLDP reception on this interface") }),
    "no": node("Negate a command or set its defaults", {
      cdp:          node("CDP commands", { enable: leaf("Disable CDP on this interface") }),
      description:  leaf("Remove description"),
      ip:           node("IP commands", { address: leaf("Remove IP address"), nat: leaf("Remove NAT designation"), ospf: leaf("Remove OSPF from interface") }),
      ipv6:         node("IPv6 commands", { address: leaf("Remove IPv6 address"), enable: leaf("Disable IPv6") }),
      lldp:         node("LLDP commands", { transmit: leaf("Disable LLDP transmission"), receive: leaf("Disable LLDP reception") }),
      "channel-group": leaf("Remove interface from channel group"),
      shutdown:     leaf("Bring up the interface"),
      switchport:   leaf("Put interface in routed mode"),
      "spanning-tree": node("STP commands", { portfast: leaf("Disable PortFast"), bpduguard: leaf("Disable BPDU Guard") }),
    }),
    shutdown: leaf("Shutdown the selected interface"),
    "spanning-tree": both("Spanning tree commands", {
      bpduguard: both("Block BPDUs", { enable: leaf("Enable BPDU guard"), disable: leaf("Disable BPDU guard") }),
      cost:      node("Change interface tree cost", { _arg: leaf("<1-200000000>  Cost") }),
      guard:     node("Change guard mode", { root: leaf("Enable root guard"), none: leaf("Disable guard") }),
      portfast:  both("Portfast options", { disable: leaf("Disable portfast"), trunk: leaf("Enable portfast on trunk") }),
      priority:  node("Change spanning tree priority", { _arg: leaf("<0-240>  Priority (increments of 16)") }),
    }),
    speed: node("Configure speed operation", { auto: leaf("Enable automatic speed negotiation"), "10": leaf("Force 10 Mbps"), "100": leaf("Force 100 Mbps"), "1000": leaf("Force 1000 Mbps") }),
    "storm-control": node("Storm control", { broadcast: node("Broadcast storm control", { level: node("Set threshold levels", { _arg: leaf("<0.00-100.00>  Rising threshold level (%)") }) }), action: node("Action on storm", { shutdown: leaf("Shutdown interface on storm"), trap: leaf("Send SNMP trap") }) }),
    switchport: node("Set switching mode characteristics", {
      access: node("Set access mode characteristics", { vlan: node("Set VLAN when in access mode", { _arg: leaf("<1-4094>  VLAN ID of the VLAN when this port is in access mode") }) }),
      mode: node("Set trunking mode of the interface", {
        access:  leaf("Set trunking mode to ACCESS unconditionally"),
        trunk:   leaf("Set trunking mode to TRUNK unconditionally"),
        dynamic: node("Set trunking mode dynamically", { auto: leaf("Set mode to DYNAMIC AUTO"), desirable: leaf("Set mode to DYNAMIC DESIRABLE") }),
      }),
      nonegotiate: leaf("Device will not engage in DTP negotiation"),
      "port-security": both("Port Security", {
        maximum:   node("Max secure addresses", { _arg: leaf("<1-3072>  Maximum addresses") }),
        violation: node("Security violation mode", { protect: leaf("Security violation protect mode"), restrict: leaf("Security violation restrict mode"), shutdown: leaf("Security violation shutdown mode") }),
        "mac-address": both("Secure mac address", { sticky: leaf("Configure dynamic secure addresses as sticky"), _arg: leaf("<H.H.H>  48-bit hardware address") }),
        aging:     node("Port-security aging", { time: leaf("<1-1440>  Aging time in minutes"), type: node("Aging type", { absolute: leaf("Absolute aging"), inactivity: leaf("Inactivity aging") }) }),
      }),
      trunk: node("Set trunking characteristics", {
        allowed: node("Set allowed VLANs", { vlan: node("Set allowed VLANs", { _arg: leaf("<vlan-list>  VLAN IDs"), add: leaf("<vlan-list>  VLANs to add"), remove: leaf("<vlan-list>  VLANs to remove"), except: leaf("<vlan-list>  All VLANs except listed"), all: leaf("All VLANs"), none: leaf("No VLANs") }) }),
        encapsulation: node("Set trunking encapsulation", { dot1q: leaf("Interface uses only 802.1q trunking encapsulation"), isl: leaf("Interface uses only ISL trunking encapsulation"), negotiate: leaf("Device will negotiate trunking encapsulation") }),
        native: node("Set trunking native characteristics", { vlan: node("Set native VLAN", { _arg: leaf("<1-4094>  Native VLAN ID") }) }),
      }),
      voice: node("Voice appliance attributes", { vlan: node("Vlan for voice traffic", { _arg: leaf("<1-4094>  Voice VLAN ID"), dot1p: leaf("Priority tagged on PVID"), none: leaf("Don't tell telephone about voice vlan"), untagged: leaf("Untagged on PVID") }) }),
    }),
  },

  // ── SUBINTERFACE CONFIG ──────────────────────────────────────────────────
  "config-subif": {
    do: DO_CMDS,
    description: both("Interface specific description", { _arg: leaf("<line>  Description") }),
    encapsulation: node("Set encapsulation type", { dot1q: node("IEEE 802.1Q Virtual LAN", { _arg: both("<1-4094>  VLAN ID", { native: leaf("Make this native VLAN") }) }) }),
    ip: node("Interface IP config", {
      address: both("Set IP address", { _arg: node("<A.B.C.D>  IP address", { _arg: leaf("<A.B.C.D>  IP subnet mask") }) }),
      "helper-address": both("Specify destination for UDP broadcasts", { _arg: leaf("<A.B.C.D>  IP destination") }),
      nat: node("NAT interface commands", { inside: leaf("Inside interface"), outside: leaf("Outside interface") }),
      ospf: both("OSPF interface commands", { _arg: node("<1-65535>  Process ID", { area: node("Area", { _arg: leaf("<0-4294967295>  Area ID") }) }) }),
    }),
    ipv6: node("IPv6 subinterface config", { address: both("Configure IPv6 address", { _arg: both("<X:X:X:X::X/n>  IPv6 address", { "eui-64": leaf("Use EUI-64") }) }) }),
    "no":     node("Negate a command", { shutdown: leaf("Bring up the subinterface"), ip: node("IP commands", { address: leaf("Remove IP address") }) }),
    shutdown: leaf("Shutdown the subinterface"),
  },

  // ── LINE CONFIG ──────────────────────────────────────────────────────────
  "config-line": {
    do: DO_CMDS,
    "access-class": node("Filter connections based on IP access list", { _arg: node("<n>  Access list name", { in: leaf("Filter incoming connections"), out: leaf("Filter outgoing connections") }) }),
    "exec-timeout": both("Set the EXEC timeout", { _arg: both("<0-35791>  Timeout in minutes", { _arg: leaf("<0-2147483>  Timeout in seconds") }) }),
    login: both("Enable password checking", { local: leaf("Local password checking"), tacacs: leaf("Use TACACS password checking") }),
    logging: node("Modify message logging", { synchronous: leaf("Synchronize unsolicited messages and debug output") }),
    "no": node("Negate a command", { "exec-timeout": leaf("Remove exec timeout"), logging: leaf("Remove logging") }),
    password: both("Set a line password", { _arg: leaf("<password>  The password string") }),
    privilege: node("Change privilege level for line", { level: node("Assign privilege level", { _arg: leaf("<0-15>  Privilege level") }) }),
    transport: node("Define transport protocols for line", {
      input:  node("Define which protocols to use for incoming connections", { all: leaf("All protocols"), none: leaf("No protocols"), ssh: leaf("Secure Shell"), telnet: leaf("TCP/IP Telnet protocol") }),
      output: node("Define which protocols to use for outgoing connections", { all: leaf("All protocols"), none: leaf("No protocols"), ssh: leaf("Secure Shell"), telnet: leaf("TCP/IP Telnet protocol") }),
    }),
  },

  // ── ROUTER CONFIG ────────────────────────────────────────────────────────
  "config-router": {
    do: DO_CMDS,
    area: node("OSPF area parameters", { _arg: node("<0-4294967295>  OSPF area ID", { authentication: both("Enable authentication", { "message-digest": leaf("Use message-digest authentication") }), "default-cost": leaf("<0-16777215>  Cost for default summary route"), nssa: leaf("NSSA settings"), stub: leaf("Settings for configuring the area as a stub") }) }),
    "auto-cost": node("Calculate OSPF interface cost", { "reference-bandwidth": node("Use reference bandwidth method", { _arg: leaf("<1-4294967>  Reference bandwidth in Mbits/sec") }) }),
    "default-information": node("Control distribution of default information", { originate: both("Distribute a default route", { always: leaf("Always advertise default route"), metric: leaf("<0-16777214>  OSPF default metric") }) }),
    distance: both("Define an administrative distance", { ospf: node("OSPF distance", { intra: leaf("<1-255>  Intra-area distance"), inter: leaf("<1-255>  Inter-area distance"), external: leaf("<1-255>  External route distance") }) }),
    "log-adjacency-changes": both("Log changes in adjacency state", { detail: leaf("Log all state changes") }),
    network: node("Enable routing on an IP network", { _arg: node("<A.B.C.D>  Network number", { _arg: node("<A.B.C.D>  OSPF wild card bits", { area: node("Set the OSPF area ID", { _arg: leaf("<0-4294967295>  OSPF area ID") }) }) }) }),
    "no": node("Negate a command", { "passive-interface": node("Restore interface to active routing", { _arg: leaf("<interface>  Interface name"), default: leaf("Restore all interfaces") }), network: leaf("<A.B.C.D>  Remove network"), "router-id": leaf("Remove router-id") }),
    "passive-interface": both("Suppress routing updates on an interface", { _arg: leaf("<interface>  Interface name"), default: leaf("Suppress routing updates on all interfaces") }),
    redistribute: node("Redistribute information from another routing protocol", { connected: both("Connected routes", { subnets: leaf("Consider subnets for redistribution") }), static: both("Static routes", { subnets: leaf("Consider subnets for redistribution") }), rip: both("RIP routes", { subnets: leaf("Consider subnets for redistribution") }) }),
    "router-id": node("Override configured router ID", { _arg: leaf("<A.B.C.D>  OSPF router-id in IP address format") }),
  },

  // ── VLAN CONFIG ──────────────────────────────────────────────────────────
  "config-vlan": {
    do:    DO_CMDS,
    name:  both("ASCII name of the VLAN", { _arg: leaf("<n>  VLAN name (1-32 characters)") }),
    state: node("Operational state of the VLAN", { active: leaf("VLAN Active State"), suspend: leaf("VLAN Suspended State") }),
    mtu:   both("VLAN Maximum Transmission Unit", { _arg: leaf("<1500-9216>  MTU value") }),
    "no":  node("Negate a command", { name: leaf("Remove VLAN name") }),
  },

  // ── ACL CONFIG (standard) ────────────────────────────────────────────────
  "config-acl": {
    do:     DO_CMDS,
    permit: node("Specify packets to forward", { ...STD_SRC }),
    deny:   node("Specify packets to reject", { ...STD_SRC }),
    remark: both("Access list entry comment", { _arg: leaf("<text>  Comment up to 100 characters") }),
    "no":   node("Negate a command", { _arg: leaf("<1-2147483647>  Sequence number to delete") }),
  },

  // ── ACL CONFIG (extended) ────────────────────────────────────────────────
  "config-ext-acl": {
    do:     DO_CMDS,
    permit: node("Specify packets to forward", { ...EXT_PROTO }),
    deny:   node("Specify packets to reject", { ...EXT_PROTO }),
    remark: both("Access list entry comment", { _arg: leaf("<text>  Comment up to 100 characters") }),
    "no":   node("Negate a command", { _arg: leaf("<1-2147483647>  Sequence number to delete") }),
  },

  // ── DHCP POOL CONFIG ─────────────────────────────────────────────────────
  "config-dhcp": {
    do:               DO_CMDS,
    "default-router": both("Default routers", { _arg: leaf("<A.B.C.D>  Router IP address") }),
    "dns-server":     both("DNS servers", { _arg: leaf("<A.B.C.D>  DNS server IP address") }),
    "domain-name":    both("Domain name", { _arg: leaf("<n>  Domain name") }),
    lease: both("Lease time", { _arg: both("<0-365>  Days", { _arg: both("<0-23>  Hours", { _arg: leaf("<0-59>  Minutes") }) }), infinite: leaf("Infinite lease") }),
    network:  both("Network number and mask", { _arg: node("<A.B.C.D>  Network number", { _arg: leaf("<A.B.C.D>  Network mask") }) }),
    option:   both("Raw DHCP options", { _arg: leaf("<0-254>  DHCP option code") }),
    "no":     node("Negate a command", { "default-router": leaf("Remove default router"), "dns-server": leaf("Remove DNS server"), "domain-name": leaf("Remove domain name") }),
  },
};

// ─── LOOKUP FUNCTION ──────────────────────────────────────────────────────────
export function lookupCmd(input, mode) {
  const tree = CMD_TREE[mode] || {};
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const endsWithSpace = input.endsWith(" ");

  let current = tree;
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    const isLast = i === words.length - 1;

    if (isLast && !endsWithSpace) {
      // Partial word — find all keys starting with this prefix
      const matches = Object.entries(current)
        .filter(([k]) => !k.startsWith("_") && k.startsWith(word))
        .map(([k, v]) => ({ word: k, desc: v._desc || "" }));
      return { matches, partial: word };
    }

    if (current[word]) {
      current = current[word];
      i++;
      continue;
    }
    // Prefix/abbreviation match
    const abbrevMatches = Object.keys(current).filter(k => !k.startsWith("_") && k.startsWith(word));
    if (abbrevMatches.length === 1) {
      current = current[abbrevMatches[0]];
      i++;
      continue;
    }
    // Positional argument fallback
    if (current._arg) {
      current = current._arg;
      i++;
      continue;
    }
    return { matches: [], partial: word };
  }

  // At end with trailing space — show all children
  const matches = Object.entries(current)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => ({ word: k, desc: v._desc || "" }));

  if (current._eol) matches.push({ word: "<cr>", desc: "" });
  if (current._arg) matches.push({ word: current._arg._desc || "<value>", desc: "" });

  return { matches, partial: "" };
}
