const Producer = require('../models/Producer');
const User = require('../models/User');
const TrustService = require('../services/trustService');

// Fórmula Haversine para calcular distancia entre dos puntos en km
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

exports.getProducers = async (req, res) => {
  try {
    const { lat, lng, radio, soloConfianza, minReputacion } = req.query;
    const userId = req.user ? req.user.id : null;

    // Obtener datos del usuario logueado para verificar sus contactos
    let hasContacts = false;
    if (userId) {
      const currentUser = await User.findById(userId).select('contacts');
      hasContacts = currentUser && currentUser.contacts && currentUser.contacts.length > 0;
    }

    // Solo traer productores cuyos usuarios estén activos
    let producers = await Producer.find().populate({
      path: 'user',
      select: 'nombre email activo isSelecto contacts reputationScore',
      match: { activo: true }
    });

    const filteredProducers = [];
    for (const p of producers) {
      if (!p.user) continue;

      // 1. Calcular nivel de confianza
      const trustLevel = userId ? await TrustService.calculateTrustLevel(userId, p.user._id) : 0;
      p._doc.trustLevel = trustLevel;

      // 2. Lógica de Visibilidad Base
      const isVisible = !p.user.isSelecto || (p.user.contacts && p.user.contacts.length === 0) || trustLevel > 0;
      if (!isVisible) continue;

      // 3. Filtro soloConfianza (Estricto: solo niveles 1, 2 y 3)
      if (soloConfianza === 'true' && trustLevel === 0) {
        continue;
      }

      // 4. Filtro de Reputación
      if (minReputacion && !isNaN(minReputacion)) {
        if (p.user.reputationScore < parseInt(minReputacion)) continue;
      }

      filteredProducers.push(p);
    }

    producers = filteredProducers;

    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadio = Math.min(parseFloat(radio) || 5, 20);

      if (!isNaN(userLat) && !isNaN(userLng)) {
        producers = producers.filter(p => {
          if (!p.ubicacion || !p.ubicacion.lat) return false;
          const dist = calculateDistance(userLat, userLng, p.ubicacion.lat, p.ubicacion.lng);
          return dist <= maxRadio;
        });
      }
    }

    res.json(producers);
  } catch (err) {
    console.error('Error en getProducers:', err);
    res.status(500).json({ msg: 'Error interno del servidor al obtener productores' });
  }
};

exports.getProducerById = async (req, res) => {
  try {
    const producer = await Producer.findById(req.params.id).populate('user', 'nombre email');
    if (!producer) return res.status(404).json({ msg: 'Productor no encontrado' });
    res.json(producer);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.upsertProfile = async (req, res) => {
  const { descripcion, zona, contacto, ubicacion, categoria } = req.body;
  
  // Validaciones básicas
  if (!descripcion || !zona || !contacto) {
    return res.status(400).json({ msg: 'Por favor complete todos los campos obligatorios' });
  }

  try {
    let producer = await Producer.findOne({ user: req.user.id });
    
    // Redondear coordenadas para privacidad (aprox 1.1km de precisión)
    let safeUbicacion;
    if (ubicacion && typeof ubicacion.lat === 'number' && typeof ubicacion.lng === 'number') {
      // Validar rangos
      if (ubicacion.lat < -90 || ubicacion.lat > 90 || ubicacion.lng < -180 || ubicacion.lng > 180) {
        return res.status(400).json({ msg: 'Coordenadas fuera de rango' });
      }
      safeUbicacion = {
        lat: Math.round(ubicacion.lat * 100) / 100,
        lng: Math.round(ubicacion.lng * 100) / 100
      };
    }

    const profileData = { 
      descripcion, 
      zona, 
      contacto,
      categoria: categoria || 'Otros',
      ...(safeUbicacion && { ubicacion: safeUbicacion })
    };

    if (producer) {
      producer = await Producer.findOneAndUpdate(
        { user: req.user.id },
        { $set: profileData },
        { new: true }
      );
      return res.json(producer);
    }
    producer = new Producer({ user: req.user.id, ...profileData });
    await producer.save();
    res.json(producer);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const producer = await Producer.findOne({ user: req.user.id });
    res.json(producer);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};
