const mongoose = require('mongoose');
const User = require('./User');
const Producer = require('./Producer');
const Product = require('./Product');
const Order = require('./Order');
const Trueque = require('./Trueque');
const Notification = require('./Notification');
const TokenLog = require('./TokenLog');

// Función para crear índices optimizados
const createIndexes = async () => {
  try {
    console.log('Creando índices de MongoDB...');

    // Índices para Usuario
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ 'roles.productor.activo': 1 });
    await User.collection.createIndex({ zona: 1 });
    await User.collection.createIndex({ createdAt: -1 });
    await User.collection.createIndex({ reputationScore: -1 });
    await User.collection.createIndex({ isSelecto: 1 });

    // Índices para Productor
    await Producer.collection.createIndex({ user: 1 });
    await Producer.collection.createIndex({ categoria: 1 });
    await Producer.collection.createIndex({ zona: 1 });
    await Producer.collection.createIndex({ 'ubicacion': '2dsphere' }); // Para búsquedas geográficas
    await Producer.collection.createIndex({ createdAt: -1 });

    // Índices para Producto
    await Product.collection.createIndex({ productor: 1 });
    await Product.collection.createIndex({ categoria: 1 });
    await Product.collection.createIndex({ subcategoria: 1 });
    await Product.collection.createIndex({ tags: 1 });
    await Product.collection.createIndex({ disponible: 1 });
    await Product.collection.createIndex({ precio: 1 });
    await Product.collection.createIndex({ nombre: 'text', descripcion: 'text' }); // Búsqueda de texto
    await Product.collection.createIndex({ createdAt: -1 });

    // Índices para Pedido
    await Order.collection.createIndex({ usuario: 1 });
    await Order.collection.createIndex({ productor: 1 });
    await Order.collection.createIndex({ estado: 1 });
    await Order.collection.createIndex({ createdAt: -1 });
    await Order.collection.createIndex({ total: -1 });

    // Índices para Trueque
    await Trueque.collection.createIndex({ solicitante: 1 });
    await Trueque.collection.createIndex({ solicitado: 1 });
    await Trueque.collection.createIndex({ estado: 1 });
    await Trueque.collection.createIndex({ createdAt: -1 });

    // Índices para Notificación
    await Notification.collection.createIndex({ usuario: 1 });
    await Notification.collection.createIndex({ leida: 1 });
    await Notification.collection.createIndex({ tipo: 1 });
    await Notification.collection.createIndex({ createdAt: -1 });

    // Índices para TokenLog
    await TokenLog.collection.createIndex({ usuario: 1 });
    await TokenLog.collection.createIndex({ tipo: 1 });
    await TokenLog.collection.createIndex({ createdAt: -1 });

    console.log('✅ Índices de MongoDB creados exitosamente');
  } catch (error) {
    console.error('❌ Error creando índices:', error);
    throw error;
  }
};

// Función para analizar rendimiento de consultas
const analyzeQueryPerformance = async () => {
  try {
    // Obtener estadísticas de uso de índices
    const stats = await mongoose.connection.db.stats();
    
    // Verificar consultas lentas (requiere MongoDB Atlas o configuración especial)
    const slowQueries = await mongoose.connection.db.collection('system.profile')
      .find({ millis: { $gt: 100 } })
      .sort({ ts: -1 })
      .limit(10)
      .toArray();

    return {
      databaseStats: stats,
      slowQueries: slowQueries || []
    };
  } catch (error) {
    console.error('Error analizando rendimiento:', error);
    return null;
  }
};

// Función para optimizar consultas comunes
const optimizedQueries = {
  // Búsqueda de productores por ubicación
  async findProducersNearby(lat, lng, maxDistance = 10000) { // 10km por defecto
    return await Producer.find({
      ubicacion: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: maxDistance
        }
      }
    })
    .populate('user', 'nombre email')
    .sort({ 'ubicacion': 1 })
    .limit(50)
    .lean(); // lean() para mejor rendimiento
  },

  // Búsqueda de productos por texto
  async searchProducts(text, filters = {}) {
    const query = {
      $and: [
        { disponible: true },
        filters
      ]
    };

    if (text) {
      query.$and.push({
        $or: [
          { nombre: { $regex: text, $options: 'i' } },
          { descripcion: { $regex: text, $options: 'i' } },
          { tags: { $in: [new RegExp(text, 'i')] } }
        ]
      });
    }

    return await Product.find(query)
      .populate('productor', 'nombre zona')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
  },

  // Obtener productos populares
  async getPopularProducts(limit = 10) {
    return await Product.aggregate([
      { $match: { disponible: true } },
      { $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'productos.producto',
        as: 'orders'
      }},
      { $addFields: {
        orderCount: { $size: '$orders' }
      }},
      { $sort: { orderCount: -1 } },
      { $limit: limit },
      { $lookup: {
        from: 'producers',
        localField: 'productor',
        foreignField: '_id',
        as: 'producer'
      }},
      { $unwind: '$producer' }
    ]);
  },

  // Estadísticas de usuario
  async getUserStats(userId) {
    return await Order.aggregate([
      { $match: { usuario: mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        avgOrderValue: { $avg: '$total' }
      }},
      { $lookup: {
        from: 'trueques',
        let: { userId: mongoose.Types.ObjectId(userId) },
        pipeline: [
          { $match: { $expr: { $or: [
            { $eq: ['$solicitante', '$$userId'] },
            { $eq: ['$solicitado', '$$userId'] }
          ]}}},
          { $group: { _id: null, count: { $sum: 1 } }}
        ],
        as: 'truequeStats'
      }},
      { $addFields: {
        totalTrueques: { $arrayElemAt: ['$truequeStats.count', 0] }
      }}
    ]);
  }
};

module.exports = {
  createIndexes,
  analyzeQueryPerformance,
  optimizedQueries
};
