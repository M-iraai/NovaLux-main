
Public
ENVIRONMENT
No Environment
LAYOUT
Single Column
LANGUAGE
JavaScript - Fetch
ECOTRACK API
Introduction
Authorisation
Taux limite
Commandes
Suivi des commandes
Configuration
GET
Liste des wilayas actives
GET
Liste des bureaux
GET
Liste des communes actives
GET
Tarifs des prestations
Produits
ECOTRACK API

L'API Public ECOTRACK vous permet d'utiliser le service sans passer par l'interface web et vous donne la possibilité de lier votre compte avec votre CRM, Plateforme E-commerce ou autres applications.

Les fonctionnalités disponibles sont :

    L'ajout de commande

    La modification de commande

    L'ajout et la récupération des mises a jours sur l’état de livraison

    Demander le retour d'un colis

    Suivre l'avancement de livraison d'un colis

Commandes
POSTAjouter une commande
{{url}}/api/v1/create/order?reference&nom_client=&telephone=&telephone_2&adresse=&code_postal&commune=&code_wilaya=&montant=&remarque&produit&stock&quantite&produit_a_recuperer&boutique&type=&stop_desk&weight&fragile&gps_link

Ce point de terminaison vous donne la possibilité d'ajouter des commandes sur votre compte ECOTRACK .

Tous les types sont autorisés:

    Livraison
    Pick UP
    Échange
    Recouvrement.

La requête est de type POST.
Il n'est possible d'ajouter qu'une seule commande par requête.

Le contenu de la requête est un tableau de paramètres, contenant votre token d'identification et les informations relatives à la commande.
PARAMS
reference

Reference de la commande | string , maximum 255 caractéres , optionnel
nom_client

nom & prénom du destinataire | string , maximum 255 caractéres , obligatoire
telephone

numéro de téléphone du destinataire | numeric , entre 9 et 10 chiffres , obligatoire
telephone_2

numéro de téléphone du destinataire | numeric , entre 9 et 10 chiffres , optionnel
adresse

L'adresse de livraison | string , maximum 255 caractéres , obligatoire
code_postal

Le code postal | numeric , optionnel
commune

Le nom de la commune | string , maximum 255 caractéres , obligatoire
code_wilaya

Le code de la wilaya | integer , entre 1 et 58 , obligatoire
montant

Le montant à récolter , incluant les frais de livraison| numeric , obligatoire
remarque

Remarque ou consignes à propos du colis ou de la livraison.| string , maximum 255 caractéres , optionnel
produit

Nom du/des produit(s) , Si la commande est préparée avec des produits stockés chez le prestataire, les références des produits doivent être séparées par une virgule. ( Ex : prod001,prod052 ) | string , maximum 255 caractéres , optionnel
stock

Si la commande sera préparée du stock [0 : non , 1 : oui] | integer , 0 ou 1
quantite

Si la commande est avec stock, les quantités de chaque produit séparé par une virgule | obligatoire si stock = 1
produit_a_recuperer

Produit à récuperer dans le cas d'un échange, maximum 255 caractéres , optionnel
boutique

Nom de la boutique, si vous gérez plusieurs boutiques en amant | string , maximum 255 caractéres , optionnel
type

Type de l'operation [ 1 = Livraison , 2 = Echange , 3 = PICKUP , 4 = Recouvrement ] | integer , entre 1 et 4 , obligatoire
stop_desk

choix de la prestation Livraison à domicile ou bien collecte en Point relais et STOP DESK. [ 0 = a domicile , 1 = STOP DESK ] | integer , entre 0 et 1 , optionnel
weight

Poids du colis, optionnel
fragile

Si le colis contient des produits fragiles , optionnel [ valeurs possibles 0 , 1 ]
gps_link

Lien de Localisation du client, optionnel
Example Request
Ajouter une commande - Erreur parametres
javascript

var requestOptions = {
  method: 'POST',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/create/order?reference&nom_client=&telephone=&telephone_2&adresse=&code_postal&commune=&code_wilaya=&montant=&remarque&produit&boutique&type=&stop_desk", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

422 Unprocessable Entity
Example Response

json

{
  "message": "The given data was invalid.",
  "errors": {
    "nom_client": [
      "Le champ nom client est obligatoire."
    ],
    "telephone": [
      "Le champ téléphone est obligatoire."
    ],
    "adresse": [
      "Le champ adresse est obligatoire."
    ],
    "code_wilaya": [
      "Le champ code wilaya est obligatoire."
    ],
    "commune": [
      "Le champ commune est obligatoire."
    ],
    "montant": [
      "Le champ montant est obligatoire."
    ],
    "type": [
      "Le champ type est obligatoire."
    ]
  }
}

POSTAjouter plusieurs commandes
{{url}}/api/v1/create/orders

Ce point de terminaison vous donne la possibilité d'ajouter plusieurs commandes sur votre compte ECOTRACK .

Tous les types sont autorisés:

    Livraison

    Pick UP

    Échange

    Recouvrement.

La requête est de type POST.
la limite est de 100 commandes par requette

Le contenu de la requête est un tableau contenant les commandes
Bodyraw (json)
json

{
                "orders": {
                    "0": {
                        "reference":"DEMO852",
                        "nom_client": "client 1",
                        "telephone": "0500000000",
                        "telephone_2": "",
                        "adresse": "17 rue med",
                        "code_postal":"",
                        "commune": "Oum Touyour",
                        "code_wilaya": "5",
                        "montant": "5000",
                        "remarque": "test",
                        "produit": "tesrty",
                        "stock": 1,
                        "quantite": "1",
                        "produit_a_recuperer": "",
                        "boutique" : "",
                        "type": "1",
                        "stop_desk":0,
                        "weight": "2",
                        "gps_link": "https://maps.app.goo.gl/VnX8UtFq4PVY2c7d7"
                    },
                     "1": {
                         "reference":"DEMO853",
                        "nom_client": "client 2",
                        "telephone": "0500000002",
                        "telephone_2": "",
                        "adresse": "17 rue med",
                        "code_postal":"",
                        "commune": "Oum Touyour",
                        "code_wilaya": "5",
                        "montant": "5000",
                        "remarque": "test",
                        "produit": "tesrty",
                        "stock": 1,
                        "quantite": "1",
                        "produit_a_recuperer": "",
                        "boutique" : "",
                        "type": "1",
                        "stop_desk":0,
                        "weight": "2"
                    }
                }
}

Example Request
Ajouter plusieurs commandes - Erreur parametres
javascript

var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

var raw = JSON.stringify({
  "orders": {
    "0": {
      "reference": "DEMO852",
      "nom_client": "client 1",
      "telephone": "",
      "telephone_2": "",
      "adresse": "17 rue med",
      "code_postal": "",
      "commune": "Oum Touyour",
      "code_wilaya": "",
      "montant": "5000",
      "remarque": "test",
      "produit": "tesrty",
      "stock": 1,
      "quantite": "1",
      "produit_a_recuperer": "",
      "boutique": "",
      "type": "1",
      "stop_desk": 0,
      "weight": "2"
    },
    "1": {
      "reference": "DEMO853",
      "nom_client": "client 2",
      "telephone": "05600000001",
      "telephone_2": "",
      "adresse": "17 rue med",
      "code_postal": "",
      "commune": "Draria",
      "code_wilaya": "16",
      "montant": "5000",
      "remarque": "test",
      "produit": "tesrty",
      "stock": 1,
      "quantite": "1",
      "produit_a_recuperer": "",
      "boutique": "",
      "type": "1",
      "stop_desk": 0,
      "weight": "2"
    }
  }
});

var requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: raw,
  redirect: 'follow'
};

fetch("{{url}}/api/v1/create/orders", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

422 Unprocessable Entity
Example Response

json

{
  "results": {
    "DEMO852": {
      "telephone": [
        "Le champ téléphone est obligatoire."
      ],
      "code_wilaya": [
        "Le champ code wilaya est obligatoire."
      ],
      "commune": [
        "Commune mal écrite, ou désactivée.",
        "Wilaya mal écrite, ou désactivée."
      ]
    },
    "DEMO853": {
      "success": true,
      "tracking": "ECTNYH2407062554"
    }
  }
}

POSTModifier une commande
{{url}}/api/v1/update/order?tracking={{tracking}}&reference&client&tel&tel2&adresse=&code_postal&commune&wilaya=&montant=&remarque&product&boutique&type&stop_desk&fragile&gps_link

Ce point de terminaison vous donne la possibilité d’apporter des modifications sur une commande après sa création et avant sa validation.
PARAMS
tracking

{{tracking}}

L'identifiant unique de la commande | obligatoire
reference

Reference de la commande | string , maximum 255 caractéres , optionel
client

nom & prénom du destinataire | string , maximum 255 caractéres , optionel
tel

numéro de téléphone du destinataire | numeric , entre 9 et 10 chiffres , optionel
tel2

numéro de téléphone du destinataire | numeric , entre 9 et 10 chiffres , optionel
adresse

L'adresse de livraison | string , maximum 255 caractéres , optionel
code_postal

Le code postal | numeric , optionel
commune

Le nom de la commune | string , maximum 255 caractéres , optionel
wilaya

Le code de la wilaya | integer , entre 1 et 58 , optionel
montant

Le montant a récolté , incluant les frais de livraison| numeric , optionel
remarque

Remarque ou consignes a propo du colis ou de la livraison | string , maximum 255 caractéres , optionel
product

Nom du/des produit(s) | string , maximum 255 caractéres , optionel
boutique

Nom de la boutique, si vous geré plusieurs boutiques en amant | string , maximum 255 caractéres , optionel
type

Type de l'operation [ 1 = Livraison , 2 = Echange , 3 = PICKUP , 4 = Recouvrement ] | integer , entre 1 et 4 , optionel
stop_desk

choix de la prestation Livraison a domicile ou bien collecte en Point relais et STOP DESK. [ 0 = a domicile , 1 = STOP DESK ] | integer , entre 0 et 1 , optionel
fragile

Colis fragile. [ 0 = NON , 1 = OUI ] | integer , entre 0 et 1 , optionel
gps_link

Lien de Localisation du client
Example Request
Modifier une commande
javascript

var requestOptions = {
  method: 'POST',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/update/order?tracking=ECQFLD2102097671&code_wilaya=17&reference=2904&montant=7000", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "success": true,
  "message": "Commande modifiée avec succès"
}

DELETESupprimer une commande
{{url}}/api/v1/delete/order?tracking={{tracking}}

Ce point de terminaison vous donne la possibilité de supprimer la commande, tant que l’expédition n'est pas validée
PARAMS
tracking

{{tracking}}

L'identifiant unique de la commande | obligatoire
Example Request
Supprimer une commande - Erreur commande non modifiable
javascript

var requestOptions = {
  method: 'DELETE',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/delete/order?tracking=ECQFLD2103057671", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "success": false,
  "error": 10001,
  "message": "Commande non modifiable"
}

POSTExpedier une commande
{{url}}/api/v1/valid/order?tracking={{tracking}}&ask_collection

Ce point de terminaison est utilisé pour valider et expédier une commande.

NB: Après l’expédition de la commande il ne sera plus possible de modifier les informations ou de la supprimer.
PARAMS
tracking

{{tracking}}

L'identifiant unique de la commande | obligatoire
ask_collection

Demande de ramassage du colis | int , 1 = demander un ramassage , 0 = pas de remassage
Example Request
Valider & Expedier une commande
javascript

var requestOptions = {
  method: 'POST',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/valid/order?tracking= ECQFLD2102097670", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "success": true,
  "message": "Commande expedier avec succès"
}

Suivi des commandes
POST Ajouter une information de suivi sur le colis
{{url}}/api/v1/add/maj?tracking={{tracking}}&content={{text}}

Après expédition et pendant le process de livraison de votre commande vous pouvez ajouter des remarques sur le colis pour notifier la société de livraison sur un éventuel changement.

Ce point de terminaison vous permet d'ajouter une mise à jour sur votre colis
PARAMS
tracking

{{tracking}}

L'identifiant unique de la commande | obligatoire
content

{{text}}

Contenu de la mise a jour | string , maximum : 255 caractéres , obligatoire
Example Request
Ajouter une information de suivi sur le colis
javascript

var requestOptions = {
  method: 'POST',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/add/maj?tracking=ECQFLD2103047673&content=Livraison avant 17:00 h", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "success": true,
  "message": "Mise a jour avec success"
}

GETSuivi et historique des operations sur une commande
{{url}}/api/v1/get/tracking/info?tracking={{tracking}}

Ce point de terminaison vous donne la possibilité de récupérer l'historique des opérations effectuées sur une commande.

Les retours possibles pour activity sont :

    order_information_received_by_carrier : Commande enregistrée et validée par le vendeur

    picked: Commande récupérée par le prestataire de livraison

    accepted_by_carrier
    Commande réceptionnée par le centre de tri (Hub ou Station)

    dispatched_to_driver
    Commande dispatchée au livreur

    attempt_delivery
    Tentative de livraison

    return_asked
    Retour initié par le centre de tri (Hub ou Station)

    return_in_transit
    Retour en transit

    Return_received
    Retour réceptionné par le vendeur

    livred
    Commande livrée

    encaissed
    Commande encaissée

    payed:
    Paiement effectué

PARAMS
tracking

{{tracking}}

L'identifiant unique de la commande | obligatoire
Example Request
Suivi et historique des operations sur une commande - Erreur tracking
javascript

var requestOptions = {
  method: 'GET',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/get/tracking/info?tracking={{tracking}}", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

422 Unprocessable Entity
Example Response

json

{
  "message": "The given data was invalid.",
  "errors": {
    "tracking": [
      "Le champ tracking sélectionné est invalide."
    ]
  }
}

GETFiltre des commandes par status
{{url}}/api/v1/get/orders/status?api_token={{token}}&trackings={{tracking1}},{{tracking2}},{{tracking3}}&status={{status1}},{{status2}},{{status3}}

Ce point de terminaison vous donne la possibilité de filtrer la liste de vos commandes par leurs statuts .

Le nombre maximum de trackings soumis est de 100 par requête.

les statuts disponibles sont identique a l'affichage du menu sur votre compte expéditeur :

    prete_a_expedier,
    en_ramassage,
    en_preparation_stock,
    vers_hub,
    en_hub,
    vers_wilaya,
    en_preparation,
    en_livraison,
    suspendu,
    livre_non_encaisse,
    encaisse_non_paye,
    paiements_prets,
    paye_et_archive,
    retour_chez_livreur,
    retour_transit_entrepot,
    retour_en_traitement,
    retour_recu,
    retour_archive,
    annule
    all

PARAMS
api_token

{{token}}

token généré a partir de votre compte | obligatoire
trackings

{{tracking1}},{{tracking2}},{{tracking3}}

trackings des commandes | string | obligatoire
status

{{status1}},{{status2}},{{status3}}

status des commandes | string | obligatoire
Example Request
Filtre des commandes par status
javascript

var requestOptions = {
  method: 'GET',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/get/orders/status?api_token={{token}}&trackings={{tracking1}},{{tracking2}},{{tracking3}}&status={{status1}},{{status2}},{{status3}}", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "data": {
    "ECLWIT2505052286": {
      "status": "en_preparation",
      "order_id": "1237",
      "desk_phone": "",
      "desk_commune": "",
      "desk_map_link": "",
      "desk_address": "",
      "activity": [
        {
          "reason": "Client ne réponds pas",
          "details": "",
          "station": "Station principale",
          "driver": "HINI Djamel",
          "date": "2025-07-16",
          "time": "02:08:51",
          "postponed_to": null
        },
        {
          "reason": "Le client est absent",
          "details": "test 000029",
          "station": "Station principale",
          "driver": "HINI Djamel",
          "date": "2025-07-16",
          "time": "02:09:11",
          "postponed_to": "2025-07-19"
        },
        {
          "reason": "Écrire une remarque",
          "details": "another test",
          "station": "Station principale",
          "driver": "HINI Djamel",
          "date": "2025-07-16",
          "time": "02:09:20",
          "postponed_to": "2025-07-19"
        }
      ]
    },
    "ECLWIT2507162547": {
      "status": "en_livraison",
      "order_id": "",
      "driver_phone": "0123456789",
      "desk_phone": "",
      "desk_commune": "",
      "desk_map_link": "",
      "desk_address": "",
      "activity": [
        {
          "reason": "Remarque",
          "details": "Colis a livrer le 23 juillet",
          "station": "Station principale",
          "driver": "",
          "date": "2025-07-16",
          "time": "02:31:15",
          "postponed_to": "2025-07-23"
        }
      ]
    },
    "ECLWIT2505052287": {
      "status": "encaisse_non_paye",
      "order_id": "",
      "estimated_fee": 700,
      "activity": []
    }
  }
}

Configuration
GETListe des wilayas actives
{{url}}/api/v1/get/wilayas

Ce point de terminaison permet de récupérer la liste des wilayas livrable par la société de livraison.
Example Request
Liste des wilayas actives
javascript

var requestOptions = {
  method: 'GET',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/get/wilayas", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

[
  {
    "wilaya_id": 1,
    "wilaya_name": "Adrar"
  },
  {
    "wilaya_id": 2,
    "wilaya_name": "Chlef"
  },
  {
    "wilaya_id": 3,
    "wilaya_name": "Laghouat"
  },
  {
    "wilaya_id": 4,
    "wilaya_name": "Oum El Bouaghi"
  },
  {
    "wilaya_id": 5,
    "wilaya_name": "Batna"
  },
  {
    "wilaya_id": 6,
    "wilaya_name": "Béjaïa"
  },
  {
    "wilaya_id": 7,
    "wilaya_name": "Biskra"
  },
  {
    "wilaya_id": 8,
    "wilaya_name": "Béchar"
  },
  {
    "wilaya_id": 9,
    "wilaya_name": "Blida"
  },
  {
    "wilaya_id": 10,
    "wilaya_name": "Bouira"
  },
  {
    "wilaya_id": 11,
    "wilaya_name": "Tamanrasset"
  },
  {
    "wilaya_id": 13,
    "wilaya_name": "Tlemcen"
  },
  {
    "wilaya_id": 14,
    "wilaya_name": "Tiaret"
  },
  {
    "wilaya_id": 15,
    "wilaya_name": "Tizi Ouzou"
  },
  {
    "wilaya_id": 16,
    "wilaya_name": "Alger"
  },
  {
    "wilaya_id": 17,
    "wilaya_name": "Djelfa"
  },
  {
    "wilaya_id": 18,
    "wilaya_name": "Jijel"
  },
  {
    "wilaya_id": 19,
    "wilaya_name": "Sétif"
  },
  {
    "wilaya_id": 20,
    "wilaya_name": "Saïda"
  },
  {
    "wilaya_id": 21,
    "wilaya_name": "Skikda"
  },
  {
    "wilaya_id": 22,
    "wilaya_name": "Sidi Bel Abbès"
  },
  {
    "wilaya_id": 23,
    "wilaya_name": "Annaba"
  },
  {
    "wilaya_id": 24,
    "wilaya_name": "Guelma"
  },
  {
    "wilaya_id": 25,
    "wilaya_name": "Constantine"
  },
  {
    "wilaya_id": 26,
    "wilaya_name": "Médéa"
  },
  {
    "wilaya_id": 27,
    "wilaya_name": "Mostaganem"
  },
  {
    "wilaya_id": 28,
    "wilaya_name": "M'Sila"
  },
  {
    "wilaya_id": 29,
    "wilaya_name": "Mascara"
  },
  {
    "wilaya_id": 30,
    "wilaya_name": "Ouargla"
  },
  {
    "wilaya_id": 31,
    "wilaya_name": "Oran"
  },
  {
    "wilaya_id": 32,
    "wilaya_name": "El Bayadh"
  },
  {
    "wilaya_id": 33,
    "wilaya_name": "Illizi"
  },
  {
    "wilaya_id": 34,
    "wilaya_name": "Bordj Bou Arreridj"
  },
  {
    "wilaya_id": 35,
    "wilaya_name": "Boumerdès"
  },
  {
    "wilaya_id": 36,
    "wilaya_name": "El Tarf"
  },
  {
    "wilaya_id": 37,
    "wilaya_name": "Tindouf"
  },
  {
    "wilaya_id": 38,
    "wilaya_name": "Tissemsilt"
  },
  {
    "wilaya_id": 39,
    "wilaya_name": "El Oued"
  },
  {
    "wilaya_id": 40,
    "wilaya_name": "Khenchela"
  },
  {
    "wilaya_id": 41,
    "wilaya_name": "Souk Ahras"
  },
  {
    "wilaya_id": 42,
    "wilaya_name": "Tipaza"
  },
  {
    "wilaya_id": 43,
    "wilaya_name": "Mila"
  },
  {
    "wilaya_id": 44,
    "wilaya_name": "Aïn Defla"
  },
  {
    "wilaya_id": 45,
    "wilaya_name": "Naâma"
  },
  {
    "wilaya_id": 46,
    "wilaya_name": "Aïn Témouchent"
  },
  {
    "wilaya_id": 47,
    "wilaya_name": "Ghardaïa"
  },
  {
    "wilaya_id": 48,
    "wilaya_name": "Relizane"
  }
]

GETListe des bureaux
{{url}}/api/v1/get/desks

Ce point de terminaison permet de récupérer la liste des bureaux actifs de la société de livraison.
AUTHORIZATIONBearer Token
Token

{{token}}
Example Request
Liste des bureaux
javascript

var requestOptions = {
  method: 'GET',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/get/desks", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

{
  "my_desk": {
    "hub_id": 6,
    "hub_name": "Station Batna",
    "location": {
      "wilaya": "Batna",
      "commune": "Batna",
      "adresse": "lorem ipsum",
      "phone": "0660000000",
      "phone2": "0770000000",
      "email": "test@test.test",
      "map": "https://maps.app.goo.gl/FC2477wQmJBEde4D9"
    },
    "working_hours": [
      {
        "days": "Dimanche – Mardi, Jeudi",
        "hours": "09:00 - 17:00"
      },
      {
        "days": "Mercredi",
        "hours": "09:00 - 16:00"
      }
    ]
  },
  "other_desks": [
    {
      "name": "Station Adrar",
      "phone": "05555555",
      "phone2": null,
      "code_wilaya": "1",
      "wilaya": "Adrar",
      "commune": "Adrar",
      "adresse": "أدرار",
      "map": null
    },
    {
      "name": "station chlef",
      "phone": null,
      "phone2": null,
      "code_wilaya": "2",
      "wilaya": "Chlef",
      "commune": "Chlef",
      "adresse": null,
      "map": null
    },
    {
      "name": "station bechar",
      "phone": null,
      "phone2": null,
      "code_wilaya": "8",
      "wilaya": "Béchar",
      "commune": "Bechar",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station blida",
      "phone": "0776000000",
      "phone2": "0664333333",
      "code_wilaya": "9",
      "wilaya": "Blida",
      "commune": "Blida",
      "adresse": "lorem ipsum 167 rue mod samir bouglola",
      "map": "https://maps.app.goo.gl/FC2477wQmJBEde4D9"
    },
    {
      "name": "station bouira",
      "phone": null,
      "phone2": null,
      "code_wilaya": "10",
      "wilaya": "Bouira",
      "commune": "Bouira",
      "adresse": null,
      "map": null
    },
    {
      "name": "station tizi",
      "phone": null,
      "phone2": null,
      "code_wilaya": "15",
      "wilaya": "Tizi Ouzou",
      "commune": "Tizi Ouzou",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station Alger 1",
      "phone": "0776000000",
      "phone2": "0552000000",
      "code_wilaya": "16",
      "wilaya": "Alger",
      "commune": "Alger Centre",
      "adresse": "alger",
      "map": "https://maps.app.goo.gl/FC2477wQmJBEde4D9"
    },
    {
      "name": "Station Sous-Traitance",
      "phone": "0550444444",
      "phone2": null,
      "code_wilaya": "16",
      "wilaya": "Alger",
      "commune": "Ain Benian",
      "adresse": "Ain benian",
      "map": null
    },
    {
      "name": "Station Djelfa",
      "phone": "0666444444",
      "phone2": null,
      "code_wilaya": "17",
      "wilaya": "Djelfa",
      "commune": "Djelfa",
      "adresse": null,
      "map": null
    },
    {
      "name": "station jijal",
      "phone": "0666666666",
      "phone2": null,
      "code_wilaya": "18",
      "wilaya": "Jijel",
      "commune": "Jijel",
      "adresse": "1500",
      "map": null
    },
    {
      "name": "Station Setif",
      "phone": "0550505050",
      "phone2": null,
      "code_wilaya": "19",
      "wilaya": "Sétif",
      "commune": "Setif",
      "adresse": "laararsa, setif",
      "map": null
    },
    {
      "name": "station skikda",
      "phone": null,
      "phone2": null,
      "code_wilaya": "21",
      "wilaya": "Skikda",
      "commune": "Skikda",
      "adresse": null,
      "map": null
    },
    {
      "name": "station guelma",
      "phone": null,
      "phone2": null,
      "code_wilaya": "24",
      "wilaya": "Guelma",
      "commune": "Guelma",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station Constantine",
      "phone": null,
      "phone2": null,
      "code_wilaya": "25",
      "wilaya": "Constantine",
      "commune": "Constantine",
      "adresse": "300",
      "map": null
    },
    {
      "name": "station msila",
      "phone": "0660606060",
      "phone2": null,
      "code_wilaya": "28",
      "wilaya": "M'Sila",
      "commune": "M'sila",
      "adresse": "400",
      "map": null
    },
    {
      "name": "station ourgla",
      "phone": null,
      "phone2": null,
      "code_wilaya": "30",
      "wilaya": "Ouargla",
      "commune": "Ouargla",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station Oran",
      "phone": null,
      "phone2": null,
      "code_wilaya": "31",
      "wilaya": "Oran",
      "commune": "Oran",
      "adresse": null,
      "map": null
    },
    {
      "name": "station elbayadh",
      "phone": null,
      "phone2": null,
      "code_wilaya": "32",
      "wilaya": "El Bayadh",
      "commune": "El Bayadh",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station Boumerdes",
      "phone": null,
      "phone2": null,
      "code_wilaya": "35",
      "wilaya": "Boumerdès",
      "commune": "Boumerdes",
      "adresse": null,
      "map": null
    },
    {
      "name": "station khenhela",
      "phone": null,
      "phone2": null,
      "code_wilaya": "40",
      "wilaya": "Khenchela",
      "commune": "Khenchela",
      "adresse": "حي بوزيد",
      "map": null
    },
    {
      "name": "station tleghma",
      "phone": null,
      "phone2": null,
      "code_wilaya": "43",
      "wilaya": "Mila",
      "commune": "Teleghma",
      "adresse": null,
      "map": null
    },
    {
      "name": "Station Ghardaia",
      "phone": null,
      "phone2": null,
      "code_wilaya": "47",
      "wilaya": "Ghardaïa",
      "commune": "Ghardaia",
      "adresse": null,
      "map": null
    },
    {
      "name": "station relizane",
      "phone": null,
      "phone2": null,
      "code_wilaya": "48",
      "wilaya": "Relizane",
      "commune": "Relizane",
      "adresse": null,
      "map": null
    }
  ]
}

GETListe des produits
{{url}}/api/v1/get/products/list
AUTHORIZATIONBearer Token
Token

<token>
Example Request
Liste des produits
javascript

var requestOptions = {
  method: 'GET',
  redirect: 'follow'
};

fetch("{{url}}/api/v1/get/products/list", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));

200 OK
Example Response

json

{
  "products": [
    {
      "reference": "290444",
      "barcode": null,
      "title": "kas",
      "is_active": 1,
      "image": null,
      "stock_disponible": 1,
      "stock_reserve": 1,
      "stock_phisique": 2
    }
  ],
  "pagination": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 15,
    "total": 1,
    "from": 1,
    "to": 1
  }
}

