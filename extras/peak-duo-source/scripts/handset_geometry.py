"""Canonical matched handset shells and glass; metres, inner display faces +Y."""
import math
WIDTH=.078375
HEIGHT=.108
HINGE=WIDTH/2
GLASS_WIDTH=.0744
GLASS_HEIGHT=.1048
FRONT=-.00025
BACK=-.0062
LIVE_SCREEN_OFFSET=.00008
STATIC_SCREEN_GAP=.00005

def outline(cx,width=GLASS_WIDTH,height=GLASS_HEIGHT,radius=.006,steps=12,inner_side=None,corner_radii=None):
    points=[]
    for x,z,start in ((width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,90),(-width/2+radius,-height/2+radius,180),(width/2-radius,-height/2+radius,270)):
        corner_radius=(corner_radii or {}).get(start,radius)
        if (inner_side=='right' and start in (0,270)) or (inner_side=='left' and start in (90,180)) or corner_radius<=0:
            points.append((cx+(width/2 if start in (0,270) else -width/2),height/2 if start in (0,90) else -height/2))
            continue
        center_x=(width/2-corner_radius) if start in (0,270) else (-width/2+corner_radius)
        center_z=(height/2-corner_radius) if start in (0,90) else (-height/2+corner_radius)
        for i in range(steps+1):
            a=math.radians(start+i*90/steps)
            points.append((cx+center_x+corner_radius*math.cos(a),center_z+corner_radius*math.sin(a)))
    return points

def live_screen_uv(display_name,u,v):
    # The live atlas is authored in logical display order: LEFT, RIGHT, COVER.
    # The player sees the +Y face opposite local +X, so the open panes reverse
    # U independently and leaf/body occupy logical left/right, respectively.
    # The folded cover faces the camera after its 180 degree Z fold and maps U
    # forward; the actual overlay render verifies this against readable text.
    if display_name=='cover':
        return (.5+u*.25,v)
    u=1-u
    if display_name=='bodyInner':
        return (.25+u*.25,v)
    if display_name=='leafInner':
        return (u*.25,v)
    raise ValueError(f'Unknown live screen region: {display_name}')

def glass(half,cover=False):
    cx=0 if half=='body' else HINGE
    if cover:
        # The closed cover has a flatter hinge-side pair of corners and a
        # fuller outside edge, matching the asymmetric front reference after
        # the leaf folds back across the held body.
        points=outline(cx,corner_radii={0:.0085,90:.0018,180:.0018,270:.0085})
        xmin,xmax=cx-GLASS_WIDTH/2,cx+GLASS_WIDTH/2
    else:
        # Only the outside corners are rounded. Both inner edges terminate
        # exactly at the hinge, sharing position, height and the U=.5 texel.
        xmin,xmax=(-GLASS_WIDTH/2,HINGE) if half=='body' else (0,HINGE+GLASS_WIDTH/2)
        points=[]
        zmax=GLASS_HEIGHT/2
        for x,z,start,outer in ((xmax,zmax,0,half=='leaf'),(xmin,zmax,90,half=='body'),(xmin,-zmax,180,half=='body'),(xmax,-zmax,270,half=='leaf')):
            radius=.006 if outer else 0
            centerx=x-radius if start in (0,270) else x+radius
            centerz=z-radius if start in (0,90) else z+radius
            for i in range(13 if outer else 1):
                a=math.radians(start+i*90/12)
                points.append((centerx+radius*math.cos(a),centerz+radius*math.sin(a)))
    y=BACK-LIVE_SCREEN_OFFSET if cover else FRONT+LIVE_SCREEN_OFFSET
    normal=-1 if cover else 1
    vertices=[(cx,y,0)]+[(x,y,z) for x,z in points]
    faces=[]
    for i in range(len(points)):
        tri=[0,i+1,(i+1)%len(points)+1]
        a,b,c=[vertices[j] for j in tri]
        ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])
        if ny*normal<0:tri.reverse()
        faces.append(tri)
    uvs=[]
    for x,y,z in vertices:
        t=(x-xmin)/(xmax-xmin)
        # Return face-local U. Each screen atlas maps this range into its slot.
        u=t
        uvs.append((u,(z+GLASS_HEIGHT/2)/GLASS_HEIGHT))
    return dict(half=half,normal=normal,vertices=vertices,faces=faces,uvs=uvs)
