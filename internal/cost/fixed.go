package cost

import "strings"

func (b *modelBuilder) ec2() {
	r := b.resource
	instance := r.stringOr("", "InstanceType", "instanceType")
	tenancy := r.stringOr("default", "Tenancy", "tenancy")
	if r.explicit("Placement") {
		tenancy = r.object("Placement").stringOr("default", "Tenancy")
	}
	if instance == "" || tenancy != "default" || r.explicit("LaunchTemplate", "launchTemplate", "InstanceMarketOptions", "instanceMarketOptions") {
		b.item.Monthly.missing("EC2 instance type, tenancy or purchase option is unsupported or unresolved.")
	} else {
		platform := r.stringOr("Linux", "platformDetails")
		if platform == "Linux/UNIX" {
			platform = "Linux"
		}
		if r.stringOr("", "platform") == "windows" {
			platform = "Windows"
		}
		switch platform {
		case "Linux", "Windows", "RHEL", "SUSE", "Ubuntu Pro":
			b.add(&b.item.Monthly, quote{
				service: "AmazonEC2", usage: "BoxUsage:" + instance, unit: "Hrs",
				attributes: map[string]string{
					"Instance Type": instance, "Operating System": platform, "Tenancy": "Shared", "Pre Installed S/W": "NA",
					"CapacityStatus": "Used", "MarketOption": "OnDemand", "License Model": "No License required",
				},
			}, monthHours, "")
		default:
			b.item.Monthly.missing("EC2 operating system or license is unsupported or unresolved.")
		}
	}
	if r.explicit("rootBlockDevice") {
		b.ebs(r.object("rootBlockDevice"))
	} else {
		b.item.Monthly.missing("The EC2 AMI root volume is unavailable.")
	}
	for _, key := range []string{"BlockDeviceMappings", "ebsBlockDevices"} {
		if value, exists := r.property(key); exists {
			devices, known := value.([]any)
			if !known {
				b.item.Monthly.missing("EC2 volume mappings are unresolved.")
			}
			for _, device := range devices {
				properties, _ := device.(map[string]any)
				entry := Resource{Properties: properties}
				if key == "BlockDeviceMappings" {
					if !entry.explicit("Ebs") {
						continue
					}
					entry = entry.object("Ebs")
				}
				b.ebs(entry)
			}
		}
	}
	value, configured := r.property("AssociatePublicIpAddress", "associatePublicIpAddress")
	publicIP, known := value.(bool)
	if publicIP {
		b.monthly("AmazonVPC", "PublicIPv4:InUseAddress", "Hrs", "", monthHours)
	} else if !configured || !known {
		b.item.Monthly.missing("An implicit EC2 public IPv4 address may add a charge.")
	}
}

func (b *modelBuilder) ebs(r Resource) {
	volume := r.stringOr("", "VolumeType", "volumeType", "type")
	size := r.numberOr(-1, "Size", "VolumeSize", "size", "volumeSize")
	if size <= 0 || (volume != "gp2" && volume != "gp3") {
		b.item.Monthly.missing("Only configured gp2 and gp3 volume capacity is modeled.")
		return
	}
	b.monthly("AmazonEC2", "EBS:VolumeUsage."+volume, "GB-Mo", "", size)
	if volume == "gp3" {
		iops := r.numberOr(3000, "Iops", "iops")
		throughput := r.numberOr(125, "Throughput", "throughput")
		if iops < 0 || throughput < 0 {
			b.item.Monthly.missing("Provisioned gp3 IOPS or throughput is unresolved.")
		}
		b.monthly("AmazonEC2", "EBS:VolumeP-IOPS.gp3", "IOPS-Mo", "", max(0, iops-3000))
		b.monthly("AmazonEC2", "EBS:VolumeP-Throughput.gp3", "GiBps-mo", "", max(0, throughput-125)/1024)
	}
}

func (b *modelBuilder) nat() {
	r := b.resource
	mode := r.stringOr("zonal", "AvailabilityMode", "availabilityMode")
	if strings.EqualFold(mode, "zonal") {
		b.monthly("AmazonEC2", "NatGateway-Hours", "Hrs", "NatGateway", monthHours)
	} else {
		b.item.Monthly.missing("NAT Gateway availability zones or availability mode are unresolved.")
	}
	b.item.Usage.missing("NAT Gateway data processed per request is unavailable.")
}

func (b *modelBuilder) rds() {
	r := b.resource
	class := r.stringOr("", "DBInstanceClass", "instanceClass")
	engine := r.stringOr("", "Engine", "engine")
	engines := map[string]string{"postgres": "PostgreSQL", "mysql": "MySQL", "mariadb": "MariaDB"}
	multi, known := r.boolean("MultiAZ", "multiAz")
	if class == "" || engines[engine] == "" || r.explicit("DBClusterIdentifier", "clusterIdentifier") || !known {
		b.item.Monthly.missing("RDS engine, instance class or deployment is unsupported or unresolved.")
		b.item.Usage.missing("RDS storage or I/O configuration is unavailable.")
		return
	}
	usage, deployment, prefix := "InstanceUsage:", "Single-AZ", ""
	if multi {
		usage, deployment, prefix = "Multi-AZUsage:", "Multi-AZ", "Multi-AZ-"
	}
	b.add(&b.item.Monthly, quote{
		service: "AmazonRDS", usage: usage + class, unit: "Hrs",
		attributes: map[string]string{"Instance Type": class, "Database Engine": engines[engine], "Deployment Option": deployment},
	}, monthHours, "")
	storage := r.stringOr("", "StorageType", "storageType")
	size := r.numberOr(-1, "AllocatedStorage", "allocatedStorage")
	if (storage != "gp2" && storage != "gp3") || size <= 0 {
		b.item.Monthly.missing("Only configured gp2 and gp3 RDS storage capacity is modeled.")
		b.item.Usage.missing("RDS storage or I/O configuration is unavailable.")
	} else {
		b.add(&b.item.Monthly, quote{
			service: "AmazonRDS", usage: "RDS:" + prefix + strings.ToUpper(storage) + "-Storage", unit: "GB-Mo",
			attributes: map[string]string{"Database Engine": engines[engine], "Deployment Option": deployment},
		}, size, "")
		if r.numberOr(0, "Iops", "iops") != 0 || r.numberOr(0, "StorageThroughput", "storageThroughput") != 0 {
			b.item.Monthly.missing("Additional provisioned RDS IOPS or throughput is unavailable.")
		}
	}
	if public, known := r.boolean("PubliclyAccessible", "publiclyAccessible"); public && known {
		b.monthly("AmazonVPC", "PublicIPv4:InUseAddress", "Hrs", "", monthHours)
	} else if !known || !r.explicit("PubliclyAccessible", "publiclyAccessible") {
		b.item.Monthly.missing("RDS public IPv4 configuration is unresolved.")
	}
}

func (b *modelBuilder) loadBalancer() {
	r := b.resource
	kind := r.stringOr("application", "Type", "loadBalancerType")
	operations := map[string]string{"application": "LoadBalancing:Application", "network": "LoadBalancing:Network"}
	if operation := operations[kind]; operation != "" {
		b.monthly("AWSELB", "LoadBalancerUsage", "Hrs", operation, monthHours)
		if r.explicit("MinimumLoadBalancerCapacity", "minimumLoadBalancerCapacity") {
			reservation := r.object("MinimumLoadBalancerCapacity", "minimumLoadBalancerCapacity")
			capacity := reservation.numberOr(-1, "CapacityUnits", "capacityUnits")
			b.monthly("AWSELB", "ReservedLCUUsage", "ReservedLCU-Hr", operation, monthHours*capacity)
		}
	} else {
		b.item.Monthly.missing("Only regional application and network load balancers are modeled.")
	}
	switch r.stringOr("internet-facing", "Scheme") {
	case "internet-facing":
		internal, known := r.boolean("internal")
		if !internal || !known {
			b.item.Monthly.missing("Load balancer public IPv4 address count is unavailable.")
		}
	case "internal":
	default:
		b.item.Monthly.missing("Load balancer scheme is unresolved.")
	}
	b.item.Usage.missing("Load balancer capacity units per request are unavailable.")
}
