import numpy as np
import random as rd
import matplotlib.pyplot as plt
import copy

L,l = 10,10
mat = np.zeros((L,l))

for i in range(0,L):
    for k in range(0,l):
        mat[i,k] = f"{i}" + f"{k}"

def init_matrice(L,l,p):
        coords = ([],[])
        mat = np.zeros((L,l))
        for i in range(0,L):
            for j in range(0,l):
                if (rd.random() < p):
                    mat[i,j] = 1
                    coords[0].append(i)
                    coords[1].append(j)
        return mat,coords

mat_p,coords = init_matrice(L,l,0.5)

def grp_colonne(mat):
        grps = []
        grps_f = [[]]
        y = 0
        for c in range(0,mat.shape[0]):
            y = 0
            grps.append([])
            while (y < mat.shape[1]):
                 grps[-1].append((c,y)) if mat[c,y] == 1 else grps.append([])
                 y += 1

        for i in range(0,len(grps)):
             grps[i] = tuple(set(grps[i]))
        grps = list(set(grps))
        for i in range(0,len(grps)):
             grps[i] = list(grps[i])
        grps.sort()
        
        for i in range(1,len(grps)):
            X_old= grps[i][0][0]
            X = grps[i-1][0][0] if i > 1 else X_old
            if (X_old == X):
                grps_f[-1].append(grps[i])
            else:
                grps_f.append([grps[i]])

        #print(grps)
        return grps_f

def comparer(g1,g2):
    #print(g1)
    for p1 in g1:
          for p2 in g2:
            if (p1[1] == p2[1]):
                 return True
    return False     
            

def merge_ligne(grps):
    maxi_groupe = {}
    clust_i = []
    copy_grps = copy.deepcopy(grps)
    mini_grp_ids = copy.deepcopy(grps)
    for i in range(0,len(grps)):
         for j in range(0,len(grps[i])):
            maxi_groupe[f"{i,j}"] = copy_grps[i][j]
            mini_grp_ids[i][j] = (i,j)
    #print(mini_grp_ids)
    for ind_grp in range(0,len(grps)-1):
         for mini_grp1 in range(0,len(grps[ind_grp])):
              for mini_grp2 in range(0,len(grps[ind_grp+1])):
                if comparer(grps[ind_grp][mini_grp1],grps[ind_grp+1][mini_grp2]):
                     if (mini_grp_ids[ind_grp+1][mini_grp2][1] != mini_grp_ids[ind_grp][mini_grp1][1]):
                        maxi_groupe[f"{mini_grp_ids[ind_grp][mini_grp1]}"].extend(grps[ind_grp+1][mini_grp2])
                        mini_grp_ids[ind_grp+1][mini_grp2]= mini_grp_ids[ind_grp][mini_grp1]
    

    return maxi_groupe
                       
class Site:
    sites = []
    sites_inst = []
    voisins_liste = []
    voisin_rgl = []
    clusters = []

    def __init__(self,x,y):
        self.x = x
        self.y = y
        self.voisins = [(self.x,self.y)]
        Site.sites.append((self.x,self.y))
        Site.sites_inst.append(self)

    def initialisation(L,l,p,rgl = [(1,0),(-1,0),(0,1),(0,-1)]):
        for i in range(0,L):
            for j in range(0,l):
                if rd.random() < p:
                    Site(i,j)
        Site.voisin_rgl = rgl
        for s in Site.sites_inst:
            s.voisins_trouv()
            Site.voisins_liste.append(s.voisins)
        Site.clusters_trouv()

    def voisins_trouv(self):
        for (dx,dy) in Site.voisin_rgl:
            if (self.x +dx,self.y + dy) in Site.sites:
                self.voisins.append((self.x +dx,self.y + dy))


    def clusters_trouv():
        clusters = []
        for i1 in range(0,len(Site.voisins_liste)):
            mgrpi = Site.voisins_liste[i1]
            for i2 in range(i1+1,len(Site.voisins_liste)):
                for p in Site.voisins_liste[i1]:
                    if p in Site.voisins_liste[i2]:
                        mgrpi.extend(Site.voisins_liste[i2])
            clusters.append(mgrpi)
        print(clusters)
        
        


    def plot():
        x,y = [],[]
        for c in Site.sites:
            x.append(c[0])
            y.append(c[1])
        plt.scatter(x,y,s=10)
        plt.show()

              

Site.initialisation(10,10,0.5)

print(Site.clusters)
Site.plot()


# groupes = grp_colonne(mat_p)
# max_groupe = merge_ligne(groupes)
# print(max_groupe)
# for i,j in max_groupe.items():
#      print(j,"\n")
# plt.scatter(coords[0],coords[1],s=10)
# for i,j in max_groupe.items():
#     x,y = zip(*j)
#     plt.scatter(x,y)
# plt.axis("equal")
# plt.show()


