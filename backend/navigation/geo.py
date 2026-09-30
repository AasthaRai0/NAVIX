import math

EARTH_R = 6378137.0

def latlon_to_local(lat, lon, lat0, lon0):
    lat0r = math.radians(lat0)
    east = math.radians(lon - lon0) * EARTH_R * math.cos(lat0r)
    north = math.radians(lat - lat0) * EARTH_R
    return east, north

def local_to_latlon(east, north, lat0, lon0):
    lat = lat0 + math.degrees(north / EARTH_R)
    lon = lon0 + math.degrees(east / (EARTH_R * math.cos(math.radians(lat0))))
    return lat, lon

def distance(a,b):
    return math.hypot(a[0]-b[0], a[1]-b[1])
