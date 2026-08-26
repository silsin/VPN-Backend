-- Insert sample OpenVPN server from user's config
-- Edit name, country, city, username/password as needed before inserting

INSERT INTO openvpn_servers (
  id, name, server_ip, port, protocol, ca_bundle, tls_crypt,
  auth_type, shared_username, shared_password, is_active,
  country, city, speed, created_at, updated_at
) VALUES (
  UUID(),
  'VPN-UI Server',
  '178.105.116.169',
  1195,
  'udp',
  '-----BEGIN CERTIFICATE-----
MIIByDCCAU6gAwIBAgIBATAKBggqhkjOPQQDAzAtMQ8wDQYDVQQKEwZ2cG4tdWkx
GjAYBgNVBAMTEXZwbi11aSBPcGVuVlBOIENBMB4XDTI2MDgyNTExNTAyN1oXDTM2
MDgyMjExNTAyN1owLTEPMA0GA1UEChMGdnBuLXVpMRowGAYDVQQDExF2cG4tdWkg
T3BlblZQTiBDQTB2MBAGByqGSM49AgEGBSuBBAAiA2IABFSo3T1T0pEiYOxYO4sd
cCURdef3KMKPldaImONssHckLYH9kztvJfexn1O0ZiU4SukXKUH3GAAI0OpOc9Ks
oKc2iVQwOpyVGntx/PsYQWwwz6EKjUTL4ispNXkW3qrs9qNCMEAwDgYDVR0PAQH/
BAQDAgEGMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFKJwWCu8nzRI4Ws5xGCS
UalSOLb9MAoGCCqGSM49BAMDA2gAMGUCMQC3z1WPgwvZ/0Nkz6JZKxEl3lhNhqjl
hfACZR2H01wedP3BWpbEfOI/HdlBuq0zjQECMG7xu+oa/M7DWbN9VDyH6k5FKR6Z
kW23egwcsQMV3gg+mwj4CRWasWYIlksLeARfMQ==
-----END CERTIFICATE-----',
  '-----BEGIN OpenVPN Static key V1-----
4141f5932e2cb8d31a04304b90735433
1bf064b3cf7b277c75a28c53dbecc634
e1861210082e02b0082d0c18cffbfac3
68c14185b148324f6fbfe4b0a5acba26
2fdac8487bb8a0cb89e53aa1063a7df6
9994e392bc5948251ecd175830d28f4f
6d6a4eec288873ae39faba7363caee13
fc6d67a0d1df32de15d7570dffe82954
0f2498c0fa1913df04ccc27351ce7692
3f0af4f9695356bb1f806b02d915ec89
04b631edab182e5513dac53029f3d99d
174410646705ebc69915ade81d152114
3e1dacf55f103a653b6c3b6da7ad5e18
835962c4a4cf00b9142f098d4d99fdd0
6da1e27a27ab60ed346b57c33894c010
13f5b4bf9158707318b716a95db7aad6
-----END OpenVPN Static key V1-----',
  'user-pass',
  'vpnuser',
  'vpnpass123',
  true,
  'Unknown',
  'Unknown',
  1000,
  NOW(),
  NOW()
);
