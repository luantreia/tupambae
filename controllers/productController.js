const Product = require('../models/Product');
const Producer = require('../models/Producer');
const TokenService = require('../services/tokenService');
const TrustService = require('../services/trustService');

// Helper para obtener el productor actual
const getCurrentProducer = async (userId) => {
  const producer = await Producer.findOne({ user: userId });
  if (!producer) throw new Error('Perfil de productor no encontrado');
  return producer;
};

exports.getProductsByProducer = async (req, res) => {
  try {
    const products = await Product.find({ 
      productor: req.params.producerId,
      disponible: true 
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener productos' });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { categoria, precioMax } = req.query;
    const userId = req.user ? req.user.id : null;

    // Construir query base
    let query = { disponible: true };
    if (categoria && categoria !== 'Todas') {
      query.categoria = categoria;
    }
    if (precioMax && !isNaN(precioMax)) {
      query.precio = { $lte: parseFloat(precioMax) };
    }

    const products = await Product.find(query).populate({
      path: 'productor',
      populate: { path: 'user', select: 'nombre isSelecto contacts activo' }
    });

    // Filtrar productos por visibilidad del productor
    const visibleProducts = [];
    for (const p of products) {
      // Validar que el productor y su usuario existan y estén activos
      if (!p.productor || !p.productor.user || !p.productor.user.activo) continue;

      const trustLevel = userId ? await TrustService.calculateTrustLevel(userId, p.productor.user._id) : 0;
      
      // Lógica de visibilidad: Público, Sin contactos o en Red de confianza
      const isVisible = !p.productor.user.isSelecto || 
                        (p.productor.user.contacts && p.productor.user.contacts.length === 0) || 
                        trustLevel > 0;
      
      if (isVisible) {
        visibleProducts.push(p);
      }
    }

    res.json(visibleProducts);
  } catch (err) {
    console.error('Error en getProducts:', err);
    res.status(500).json({ msg: 'Error interno del servidor al obtener productos' });
  }
};

exports.getMyProducts = async (req, res) => {
  try {
    const producer = await getCurrentProducer(req.user.id);
    const products = await Product.find({ productor: producer._id });
    res.json(products);
  } catch (err) {
    res.status(err.message === 'Perfil de productor no encontrado' ? 404 : 500).json({ msg: err.message });
  }
};

exports.createProduct = async (req, res) => {
  const { nombre, precio, unidad, categoria, tags } = req.body;
  try {
    const producer = await getCurrentProducer(req.user.id);

    const product = new Product({
      nombre,
      precio,
      unidad,
      categoria: categoria || 'Otros',
      tags: Array.isArray(tags) ? tags : [],
      productor: producer._id
    });
    await product.save();

    // Reglas de tokens para productos
    await TokenService.addTokens(req.user.id, 1, 'primera_publicacion');
    await TokenService.addTokens(req.user.id, 0.2, 'producto_publicado', product._id);

    res.json(product);
  } catch (err) {
    res.status(err.message === 'Perfil de productor no encontrado' ? 404 : 500).json({ msg: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Producto no encontrado' });

    const producer = await getCurrentProducer(req.user.id);
    if (product.productor.toString() !== producer._id.toString()) {
      return res.status(401).json({ msg: 'No autorizado' });
    }

    const { nombre, precio, unidad, disponible, categoria, tags } = req.body;
    const updateFields = {};
    if (nombre) updateFields.nombre = nombre;
    if (precio) updateFields.precio = precio;
    if (unidad) updateFields.unidad = unidad;
    if (categoria) updateFields.categoria = categoria;
    if (tags) updateFields.tags = Array.isArray(tags) ? tags : [];
    if (typeof disponible !== 'undefined') updateFields.disponible = disponible;

    // Verificar si cambió precio o disponibilidad para otorgar token
    const changedRelevant = (precio && precio !== product.precio) || (typeof disponible !== 'undefined' && disponible !== product.disponible);

    product = await Product.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });

    if (changedRelevant) {
      await TokenService.addTokens(req.user.id, 0.1, 'producto_actualizado', product._id);
    }

    res.json(product);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Producto no encontrado' });

    const producer = await getCurrentProducer(req.user.id);
    if (product.productor.toString() !== producer._id.toString()) {
      return res.status(401).json({ msg: 'No autorizado' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Producto eliminado' });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};
